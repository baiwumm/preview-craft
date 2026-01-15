declare namespace App {
  // 主题
  type Theme = typeof import('@/enums').THEME.valueType;

  // 设备类型
  type DeviceType = typeof import('@/enums').DEVICES.valueType;
}
