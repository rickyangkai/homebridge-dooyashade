<p align="center">
<img src="https://github.com/homebridge/branding/raw/latest/logos/homebridge-wordmark-logo-vertical.png" width="150">
</p>

# Homebridge Dooya Shade Plugin

这个插件可以让你通过HomeKit控制Dooya智能窗帘电机。支持开、关、暂停和位置调节等功能。

## 功能特点

- 支持多个窗帘电机的控制
- 实时反馈窗帘位置状态
- 自动重连机制，确保稳定连接
- 支持窗帘位置百分比调节
- TCP通信，支持自定义端口

## 安装

```bash
npm install -g homebridge-dooyashade
```

## 配置

在Homebridge的配置文件中(`config.json`)添加以下配置：

```json
{
  "platforms": [
    {
      "platform": "DooyaShade",
      "name": "DooyaShade",
      "host": "192.168.1.xxx",
      "port": 8899,
      "shades": [
        {
          "name": "客厅窗帘",
          "address": 1
        },
        {
          "name": "卧室窗帘",
          "address": 2
        }
      ]
    }
  ]
}
```

### 配置说明

- `platform`: 必须设置为 "DooyaShade"
- `name`: 平台名称，可自定义
- `host`: 网关IP地址
- `port`: 网关TCP端口号，默认8899
- `shades`: 窗帘设备列表
  - `name`: 窗帘名称，将显示在HomeKit中
  - `address`: 窗帘地址码，范围1-255

## 使用说明

1. 安装插件后，窗帘设备会自动添加到HomeKit
2. 在Home应用中可以：
   - 点击开/关按钮完全打开或关闭窗帘
   - 通过滑块调节窗帘开合度
   - 查看窗帘当前位置状态

## 故障排除

1. 连接失败
   - 检查网关IP地址和端口是否正确
   - 确保网关和Homebridge在同一网络中
   - 检查防火墙设置是否允许TCP连接

2. 窗帘控制无响应
   - 确认窗帘地址码设置正确
   - 检查窗帘是否处于学习模式
   - 重启Homebridge服务

## 支持

如果你在使用过程中遇到问题，可以：

1. 查看Homebridge日志获取详细错误信息
2. 在GitHub上提交Issue
3. 通过Pull Request贡献代码

## 开发

```bash
# 克隆项目
git clone https://github.com/yourusername/homebridge-dooyashade.git

# 安装依赖
npm install

# 编译TypeScript
npm run build

# 开发模式
npm run watch
```

## 许可

MIT License
