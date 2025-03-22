import type { API, Characteristic, DynamicPlatformPlugin, Logging, PlatformAccessory, PlatformConfig, Service } from 'homebridge';

import { DooyashadePlatformAccessory } from './platformAccessory.js';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings.js';
import { TCPManager, CRC16 } from './utils.js';
import { ShadeCommand } from './commands.js';

export interface ShadeConfig {
  name: string;
  address: {
    address1: number;
    address2: number;
  };
}

export interface HubConfig {
  HostIP: string;
  HostPort: number;
  shades: ShadeConfig[];
}

export class DooyashadeHomebridgePlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service;
  public readonly Characteristic: typeof Characteristic;

  // this is used to track restored cached accessories
  public readonly accessories: Map<string, PlatformAccessory> = new Map();
  public readonly discoveredCacheUUIDs: string[] = [];
  private readonly tcpManagers: Map<string, TCPManager> = new Map();
  private readonly pollingIntervals: Map<string, NodeJS.Timeout> = new Map();

  constructor(
    public readonly log: Logging,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.Service = api.hap.Service;
    this.Characteristic = api.hap.Characteristic;

    this.log.debug('Finished initializing platform:', this.config.name);

    // When this event is fired it means Homebridge has restored all cached accessories from disk.
    // Dynamic Platform plugins should only register new accessories after this event was fired,
    // in order to ensure they weren't added to homebridge already. This event can also be used
    // to start discovery of new accessories.
    this.api.on('didFinishLaunching', () => {
      log.debug('Executed didFinishLaunching callback');
      // run the method to discover / register your devices as accessories
      this.discoverDevices();
    });
  }

  configureAccessory(accessory: PlatformAccessory) {
    this.log.info('Loading accessory from cache:', accessory.displayName);
    this.accessories.set(accessory.UUID, accessory);
  }

  private setupTCPManager(hubConfig: HubConfig) {
    const key = `${hubConfig.HostIP}:${hubConfig.HostPort}`;
    if (this.tcpManagers.has(key)) {
      const existingManager = this.tcpManagers.get(key);
      if (existingManager) {
        this.log.debug(`Reusing existing TCP manager for ${key}`);
        return;
      }
    }

    this.log.info(`Setting up new TCP manager for ${hubConfig.HostIP}:${hubConfig.HostPort}`);
    const tcpManager = new TCPManager(
      hubConfig.HostIP,
      hubConfig.HostPort,
      this.log,
      (data) => this.handleTCPData(data, hubConfig),
      () => this.handleTCPConnect(hubConfig),
      () => this.handleTCPDisconnect(hubConfig),
    );

    this.tcpManagers.set(key, tcpManager);
    tcpManager.connect();
    this.log.info(`TCP manager connection initiated for ${key}`);
  }

  private handleTCPData(data: Buffer, hubConfig: HubConfig) {
    this.log.debug('Received raw data:', data.toString('hex'));

    if (!CRC16.verify(data)) {
      this.log.warn('Invalid CRC in received data');
      this.log.debug('CRC verification failed for data:', data.toString('hex'));
      return;
    }
    this.log.debug('CRC verification passed');

    const response = ShadeCommand.parseResponse(data);
    this.log.debug('Parsed response:', response);

    if (!response.isValid) {
      this.log.warn('Invalid response format');
      this.log.debug('Invalid response details:', response);
      return;
    }

    this.log.info('Valid response received from device:', {
      address1: response.address1,
      address2: response.address2,
      position: response.position,
      raw: data.toString('hex'),
    });


    // 查找对应的配件并更新状态
    for (const shade of hubConfig.shades) {
      if (shade.address.address1 === response.address1 && shade.address.address2 === response.address2) {
        const uuid = this.generateUUID(hubConfig, shade);
        const accessory = this.accessories.get(uuid);
        if (accessory) {
          const handler = new DooyashadePlatformAccessory(this, accessory);
          const position = ShadeCommand.convertPosition(response.position);
          handler.updateCurrentPosition(position);
        }
        break;
      }
    }
  }

  private handleTCPConnect(hubConfig: HubConfig) {
    this.log.info(`Connected to hub at ${hubConfig.HostIP}:${hubConfig.HostPort}`);
    // 连接成功后查询所有窗帘的状态
    for (const shade of hubConfig.shades) {
      const uuid = this.generateUUID(hubConfig, shade);
      const accessory = this.accessories.get(uuid);
      if (accessory) {
        this.log.debug(`Querying position for shade: ${shade.name} (${uuid})`);
        const handler = new DooyashadePlatformAccessory(this, accessory);
        setTimeout(() => {
          handler.queryPosition();
        }, 1000); // 延迟1秒查询，确保连接稳定
      } else {
        this.log.warn(`Accessory not found for shade: ${shade.name} (${uuid})`);
      }
    }
  }

  private handleTCPDisconnect(hubConfig: HubConfig) {
    this.log.warn(`Disconnected from hub at ${hubConfig.HostIP}:${hubConfig.HostPort}`);
  }

  private generateUUID(hubConfig: HubConfig, shade: ShadeConfig): string {
    return this.api.hap.uuid.generate(`${hubConfig.HostIP}:${hubConfig.HostPort}:${shade.address.address1}:${shade.address.address2}`);
  }

  getTCPManager(hubConfig: HubConfig): TCPManager | undefined {
    const key = `${hubConfig.HostIP}:${hubConfig.HostPort}`;
    return this.tcpManagers.get(key);
  }

  discoverDevices() {
    const hubs = this.config.hubs as HubConfig[];
    if (!Array.isArray(hubs)) {
      this.log.error('No hubs configured');
      return;
    }

    for (const hub of hubs) {
      this.setupTCPManager(hub);

      for (const shade of hub.shades) {
        const uuid = this.generateUUID(hub, shade);
        const existingAccessory = this.accessories.get(uuid);

        if (existingAccessory) {
          this.log.info('Restoring existing accessory from cache:', existingAccessory.displayName);
          existingAccessory.context.device = { hub, shade };
          this.api.updatePlatformAccessories([existingAccessory]);
          new DooyashadePlatformAccessory(this, existingAccessory);
        } else {
          this.log.info('Adding new accessory:', shade.name);
          const accessory = new this.api.platformAccessory(shade.name, uuid);
          accessory.context.device = { hub, shade };
          new DooyashadePlatformAccessory(this, accessory);
          this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
        }

        this.discoveredCacheUUIDs.push(uuid);

        // 设置状态轮询定时器
        const pollingInterval = parseInt(this.config.statePollingInterval as string || '10', 10);
        const intervalKey = `${hub.HostIP}:${hub.HostPort}:${shade.address.address1}:${shade.address.address2}`;
        if (this.pollingIntervals.has(intervalKey)) {
          clearInterval(this.pollingIntervals.get(intervalKey)!);
        }
        this.pollingIntervals.set(
          intervalKey,
          setInterval(() => {
            const accessory = this.accessories.get(uuid);
            if (accessory) {
              const handler = new DooyashadePlatformAccessory(this, accessory);
              handler.queryPosition();
            }
          }, pollingInterval * 60 * 1000),
        );
      }
    }

    for (const [uuid, accessory] of this.accessories) {
      if (!this.discoveredCacheUUIDs.includes(uuid)) {
        this.log.info('Removing existing accessory from cache:', accessory.displayName);
        this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      }
    }
  }
}
