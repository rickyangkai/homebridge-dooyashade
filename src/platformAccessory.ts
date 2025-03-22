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

  constructor(
    private readonly platform: DooyashadeHomebridgePlatform,
    private readonly accessory: PlatformAccessory,
  ) {
    this.currentPosition = 0;
    this.targetPosition = 0;
    this.positionState = this.platform.Characteristic.PositionState.STOPPED;

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

    // Update position state based on target position
    if (this.targetPosition > this.currentPosition) {
      this.positionState = this.platform.Characteristic.PositionState.INCREASING;
    } else if (this.targetPosition < this.currentPosition) {
      this.positionState = this.platform.Characteristic.PositionState.DECREASING;
    } else {
      this.positionState = this.platform.Characteristic.PositionState.STOPPED;
    }

    // Update the position state characteristic
    this.service.updateCharacteristic(this.platform.Characteristic.PositionState, this.positionState);

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
      // Device will automatically send feedback, no need to query position
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
    this.currentPosition = position;
    this.service.updateCharacteristic(this.platform.Characteristic.CurrentPosition, this.currentPosition);

    // 更新运动状态
    if (this.currentPosition === this.targetPosition) {
      this.positionState = this.platform.Characteristic.PositionState.STOPPED;
      this.service.updateCharacteristic(this.platform.Characteristic.PositionState, this.positionState);
    }
  }
}
