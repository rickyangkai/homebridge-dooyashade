import type { CharacteristicValue, PlatformAccessory, Service } from 'homebridge';

import type { DooyashadeHomebridgePlatform } from './platform.js';
import { ShadeCommand } from './commands.js';
import { CRC16 } from './utils.js';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class DooyashadePlatformAccessory {
  private service: Service;
  private currentPosition: number;
  private targetPosition: number;
  private positionState: number;
  private optimisticTimer?: NodeJS.Timeout;
  private queryTimer?: NodeJS.Timeout;

  constructor(
    private readonly platform: DooyashadeHomebridgePlatform,
    private readonly accessory: PlatformAccessory,
  ) {
    // 从存储中恢复状态，如果没有则使用默认值
    const storedState = this.accessory.context.state || {};
    this.currentPosition = storedState.currentPosition || 0;
    this.targetPosition = storedState.targetPosition || 0;
    this.positionState = storedState.positionState || this.platform.Characteristic.PositionState.STOPPED;

    // set accessory information
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Dooya')
      .setCharacteristic(this.platform.Characteristic.Model, 'Shade')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, 'Default-Serial');

    // get the WindowCovering service if it exists, otherwise create a new WindowCovering service
    this.service = this.accessory.getService(this.platform.Service.WindowCovering) ||
      this.accessory.addService(this.platform.Service.WindowCovering);

    // set the service name, this is what is displayed as the default name on the Home app
    this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.shade.name);

    // register handlers for the CurrentPosition Characteristic
    this.service.getCharacteristic(this.platform.Characteristic.CurrentPosition)
      .onGet(this.handleCurrentPositionGet.bind(this));

    // register handlers for the TargetPosition Characteristic
    this.service.getCharacteristic(this.platform.Characteristic.TargetPosition)
      .onGet(this.handleTargetPositionGet.bind(this))
      .onSet(this.handleTargetPositionSet.bind(this));

    // register handlers for the PositionState Characteristic
    this.service.getCharacteristic(this.platform.Characteristic.PositionState)
      .onGet(this.handlePositionStateGet.bind(this));
  }

  /**
   * Handle requests to get the current value of the "Current Position" characteristic
   */
  async handleCurrentPositionGet(): Promise<CharacteristicValue> {
    this.platform.log.debug('Get Characteristic CurrentPosition ->', this.currentPosition);
    return this.currentPosition;
  }

  /**
   * Handle requests to get the current value of the "Target Position" characteristic
   */
  async handleTargetPositionGet(): Promise<CharacteristicValue> {
    this.platform.log.debug('Get Characteristic TargetPosition ->', this.targetPosition);
    return this.targetPosition;
  }

  /**
   * Handle requests to set the "Target Position" characteristic
   */
  async handleTargetPositionSet(value: CharacteristicValue) {
    this.targetPosition = value as number;
    this.platform.log.debug('Set Characteristic TargetPosition ->', value);

    this.positionState = this.platform.Characteristic.PositionState.STOPPED;

    // Update the position state characteristic
    this.service.updateCharacteristic(this.platform.Characteristic.PositionState, this.positionState);
    this.service.updateCharacteristic(this.platform.Characteristic.TargetPosition, this.targetPosition);

    this.accessory.context.state = {
      currentPosition: this.currentPosition,
      targetPosition: this.targetPosition,
      positionState: this.positionState,
    };

    // Send control command to the device
    const { address1, address2 } = this.accessory.context.device.shade.address;
    const hexPosition = ShadeCommand.convertPosition(this.targetPosition, true);
    const command = ShadeCommand.createControlCommand(address1, address2, hexPosition);
    const commandWithCRC = CRC16.appendCRC(command);
    
    this.platform.log.debug('Sending control command:', {
      address1,
      address2,
      targetPosition: this.targetPosition,
      hexPosition,
      command: command.toString('hex'),
      commandWithCRC: commandWithCRC.toString('hex'),
    });
    
    const tcpManager = this.platform.getTCPManager(this.accessory.context.device.hub);
    if (tcpManager) {
      tcpManager.send(commandWithCRC);
      this.currentPosition = this.targetPosition;
      this.service.updateCharacteristic(this.platform.Characteristic.CurrentPosition, this.currentPosition);
      this.service.updateCharacteristic(this.platform.Characteristic.PositionState, this.positionState);
      this.accessory.context.state = {
        currentPosition: this.currentPosition,
        targetPosition: this.targetPosition,
        positionState: this.positionState,
      };
    }
  }

  /**
   * Handle requests to get the current value of the "Position State" characteristic
   */
  async handlePositionStateGet(): Promise<CharacteristicValue> {
    this.platform.log.debug('Get Characteristic PositionState ->', this.positionState);
    return this.positionState;
  }

  /**
   * Query the current position from the device
   */
  async queryPosition() {
    const { address1, address2 } = this.accessory.context.device.shade.address;
    const command = ShadeCommand.createQueryCommand(address1, address2);
    const commandWithCRC = CRC16.appendCRC(command);
    
    this.platform.log.debug('Sending query command:', {
      address1,
      address2,
      command: command.toString('hex'),
      commandWithCRC: commandWithCRC.toString('hex'),
    });
    
    const tcpManager = this.platform.getTCPManager(this.accessory.context.device.hub);
    if (tcpManager) {
      tcpManager.send(commandWithCRC);
    }
  }

  updateCurrentPosition(position: number) {
    if (this.optimisticTimer) {
      clearTimeout(this.optimisticTimer);
      this.optimisticTimer = undefined;
    }
    if (this.queryTimer) {
      clearTimeout(this.queryTimer);
      this.queryTimer = undefined;
    }
    this.currentPosition = position;
    this.service.updateCharacteristic(this.platform.Characteristic.CurrentPosition, this.currentPosition);

    // 更新运动状态
    if (this.currentPosition === this.targetPosition) {
      this.positionState = this.platform.Characteristic.PositionState.STOPPED;
      this.service.updateCharacteristic(this.platform.Characteristic.PositionState, this.positionState);
    }

    // 保存状态到持久化存储
    this.accessory.context.state = {
      currentPosition: this.currentPosition,
      targetPosition: this.targetPosition,
      positionState: this.positionState,
    };
  }
}
