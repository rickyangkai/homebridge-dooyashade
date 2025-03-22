# Dooya Shade RS485 TO TCP

## 项目简介
Dooya Shade RS485 TO TCP 是一个 Homebridge 插件，用于控制杜亚窗帘电机，通过 TCP 转串口模块实现与窗帘的通信。

## 安装步骤
1. 使用以下命令安装插件：
   ```bash
   npm install -g homebridge-dooyashade
   ```
2.配置插件
  1）填写TCP转485的IP地址和端口号
  2）填写窗帘的ID，用于控制窗帘
  3）设置轮训时间。
## 使用说明
无

## 配置选项
- **HostIP**: 网络转串口主机的 IP 地址，默认为 `192.168.1.100`。
- **HostPort**: 端口号，默认为 `2001`。
- **shades**: 窗帘列表，每个窗帘的名称和地址。

## 贡献指南
欢迎任何形式的贡献！请提交问题或拉取请求。

## 许可证
本项目采用 Apache-2.0 许可证，详细信息请查看 [LICENSE](LICENSE) 文件。
