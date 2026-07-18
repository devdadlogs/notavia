# Changelog

本项目遵循 [Semantic Versioning](https://semver.org/)；当前仍处于 Alpha 阶段。

## [0.1.0-alpha.1] - Unreleased

### Added

- 私有素材库、网页剪藏、语音转写和个人风格档案。
- 选题、带引用草稿、多平台转换和发布记录。
- 宿主机持久化、旧卷迁移、完整备份与恢复。
- 首用户注册锁定、凭据加密和安全自托管默认值。

### Security

- 内部 AI、数据库和缓存服务不再默认暴露宿主机端口。
- 云模型密钥改为 AES-256-GCM 加密保存。
