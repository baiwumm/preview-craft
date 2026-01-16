declare namespace App {
  // 主题
  type Theme = typeof import('@/enums').THEME.valueType;

  // 设备类型
  type DeviceType = typeof import('@/enums').DEVICES.valueType;

  // 模式
  type Mode = typeof import('@/enums').MODE.valueType;

  // 导出格式
  type ExportFormat = typeof import('@/enums').EXPORT_FORMAT.valueType;
}
