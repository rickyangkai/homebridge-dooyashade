import { Socket } from 'net';
import { Logger } from 'homebridge';

export class TCPManager {
  private socket: Socket | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private keepAliveTimer: NodeJS.Timeout | null = null;
  private isConnecting = false;
  private isConnected = false;
  private sendQueue: Buffer[] = [];
  private queueTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly host: string,
    private readonly port: number,
    private readonly log: Logger,
    private readonly onData: (data: Buffer) => void,
    private readonly onConnect: () => void,
    private readonly onDisconnect: () => void,
    private readonly sendIntervalMs: number = 500,
  ) {}

  connect() {
    if (this.isConnecting || this.socket?.connecting) {
      return;
    }

    this.isConnecting = true;
    this.socket = new Socket();

    this.socket.on('connect', () => {
      this.log.info(`Connected to ${this.host}:${this.port}`);
      this.isConnecting = false;
      this.isConnected = true;
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
      this.startKeepAlive();
      this.onConnect();
      this.processQueue();
    });

    this.socket.on('data', (data) => {
      this.onData(data);
    });

    this.socket.on('error', (error) => {
      this.log.error('Socket error:', error);
    });

    this.socket.on('close', () => {
      this.log.warn('Connection closed');
      this.isConnecting = false;
      this.isConnected = false;
      if (this.socket) {
        this.socket.destroy();
        this.socket = null;
      }
      if (this.keepAliveTimer) {
        clearInterval(this.keepAliveTimer);
        this.keepAliveTimer = null;
      }
      if (this.queueTimer) {
        clearTimeout(this.queueTimer);
        this.queueTimer = null;
      }
      this.onDisconnect();
      this.scheduleReconnect();
    });

    this.socket.connect(this.port, this.host);
  }

  private scheduleReconnect() {
    if (!this.reconnectTimer) {
      this.reconnectTimer = setTimeout(() => {
        this.connect();
      }, 60000); // 60秒后重连
    }
  }

  private startKeepAlive() {
    if (!this.keepAliveTimer) {
      this.keepAliveTimer = setInterval(() => {
        this.checkConnection();
      }, 30000); // 30秒检查一次连接
    }
  }

  private checkConnection() {
    if (!this.socket?.writable || !this.isConnected) {
      this.log.warn('Connection lost, reconnecting...');
      if (this.socket) {
        this.socket.destroy();
        this.socket = null;
      }
      this.isConnected = false;
      this.onDisconnect();
      this.scheduleReconnect();
    }
  }

  private processQueue() {
    if (this.queueTimer) {
      return;
    }
    if (this.sendQueue.length === 0) {
      return;
    }
    if (!this.socket?.writable || !this.isConnected) {
      return;
    }
    const data = this.sendQueue.shift()!;
    try {
      this.socket.write(data);
    } catch (error) {
      this.log.error('Failed to send data:', error as Error);
    }
    this.queueTimer = setTimeout(() => {
      this.queueTimer = null;
      this.processQueue();
    }, this.sendIntervalMs);
  }

  send(data: Buffer): boolean {
    this.sendQueue.push(data);
    this.processQueue();
    return true;
  }

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
  }
}

function noop() {}


export class CRC16 {
  private static readonly POLYNOMIAL = 0xA001;

  static calculate(data: Buffer): number {
    let crc = 0xFFFF;

    for (let i = 0; i < data.length; i++) {
      crc ^= data[i];
      for (let j = 0; j < 8; j++) {
        if ((crc & 0x0001) !== 0) {
          crc = (crc >> 1) ^ this.POLYNOMIAL;
        } else {
          crc = crc >> 1;
        }
      }
    }

    // 高低位交换
    return ((crc & 0xFF) << 8) | ((crc >> 8) & 0xFF);
  }

  static verify(data: Buffer): boolean {
    if (data.length < 3) {
      return false;
    }
    
    const messageData = data.slice(0, -2);
    const receivedCrc = data.readUInt16BE(data.length - 2);
    const calculatedCrc = this.calculate(messageData);
    
    return receivedCrc === calculatedCrc;
  }

  static appendCRC(data: Buffer): Buffer {
    const crc = this.calculate(data);
    const result = Buffer.alloc(data.length + 2);
    data.copy(result);
    result.writeUInt16BE(crc, data.length);
    return result;
  }
}
