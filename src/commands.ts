export class ShadeCommand {
  static readonly HEADER = 0x55;

  static createQueryCommand(address1: number, address2: number): Buffer {
    const data = Buffer.alloc(6);
    data[0] = this.HEADER;
    data[1] = address1;
    data[2] = address2;
    data[3] = 0x01;
    data[4] = 0x02;
    data[5] = 0x01;
    return data;
  }

  static createControlCommand(address1: number, address2: number, position: number): Buffer {
    const data = Buffer.alloc(6);
    data[0] = this.HEADER;
    data[1] = address1;
    data[2] = address2;
    data[3] = 0x03;
    data[4] = 0x04;
    data[5] = position;
    return data;
  }

  static parseResponse(data: Buffer): {
    address1: number;
    address2: number;
    position: number;
    isValid: boolean;
  } {
    if (data.length < 6 || data[0] !== this.HEADER) {
      return { address1: 0, address2: 0, position: 0, isValid: false };
    }

    return {
      address1: data[1],
      address2: data[2],
      position: data[5],
      isValid: true,
    };
  }

  static decimalToHex(decimal: number): number {
    return parseInt(decimal.toString(16), 16);
  }

  static hexToDecimal(hex: number): number {
    return parseInt(hex.toString(), 10);
  }

  static convertPosition(position: number, toHex = false): number {
    if (toHex) {
      // Convert 0-100 to 0-64 (hex)
      return Math.round((position / 100) * 0x64);
    } else {
      // Convert 0-64 (hex) to 0-100
      return Math.round((position / 0x64) * 100);
    }
  }
}