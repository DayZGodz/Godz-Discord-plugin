// Godz Discord Plugin - Screen/Window Utilities
// Enumerate available screens and windows for screen sharing

import { execSync } from 'node:child_process';
import { logger } from './logger.mjs';

// Get list of available monitors (Windows)
export function getMonitors() {
  try {
    const script = "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Screen]::AllScreens | ForEach-Object { [PSCustomObject]@{ Name = $_.DeviceName; Primary = $_.Primary; Width = $_.Bounds.Width; Height = $_.Bounds.Height; X = $_.Bounds.X; Y = $_.Bounds.Y } } | ConvertTo-Json -Compress";
    const result = execSync(`powershell -NoProfile -Command "${script}"`, {
      encoding: 'utf8',
      timeout: 5000,
      windowsHide: true
    });

    if (!result || !result.trim()) {
      return [];
    }

    let monitors = JSON.parse(result);
    if (!Array.isArray(monitors)) monitors = [monitors];

    return monitors.map((m, i) => ({
      id: `monitor_${i}`,
      name: m.Primary ? `${m.Name} (Principal)` : m.Name,
      type: 'monitor',
      primary: m.Primary,
      width: m.Width,
      height: m.Height,
      x: m.X,
      y: m.Y,
      displayName: `Monitor ${i + 1}${m.Primary ? ' (Principal)' : ''} - ${m.Width}x${m.Height}`
    }));
  } catch (err) {
    logger.error('Failed to get monitors:', err.message);

    // Fallback path: query display resolution from WMI.
    try {
      const fallbackScript = "Get-CimInstance Win32_VideoController | Where-Object { $_.CurrentHorizontalResolution -gt 0 -and $_.CurrentVerticalResolution -gt 0 } | Select-Object CurrentHorizontalResolution, CurrentVerticalResolution | ConvertTo-Json -Compress";
      const fallbackResult = execSync(`powershell -NoProfile -Command "${fallbackScript}"`, {
        encoding: 'utf8',
        timeout: 5000,
        windowsHide: true
      });

      if (!fallbackResult || !fallbackResult.trim()) {
        return [];
      }

      let displays = JSON.parse(fallbackResult);
      if (!Array.isArray(displays)) displays = [displays];

      return displays.map((d, i) => {
        const width = Number(d.CurrentHorizontalResolution) || 1920;
        const height = Number(d.CurrentVerticalResolution) || 1080;
        return {
          id: `monitor_fallback_${i}`,
          name: `Display ${i + 1}`,
          type: 'monitor',
          primary: i === 0,
          width,
          height,
          x: 0,
          y: 0,
          displayName: `Display ${i + 1}${i === 0 ? ' (Principal)' : ''} - ${width}x${height}`
        };
      });
    } catch (fallbackErr) {
      logger.error('Fallback monitor detection failed:', fallbackErr.message);
      return [];
    }
  }
}

// Get list of visible windows (Windows)
export function getWindows() {
  try {
    const script = "Get-Process | Where-Object { $_.MainWindowTitle -ne '' } | Select-Object Id, ProcessName, MainWindowTitle | ConvertTo-Json -Compress";
    const result = execSync(`powershell -NoProfile -Command "${script}"`, {
      encoding: 'utf8',
      timeout: 5000,
      windowsHide: true
    });

    if (!result || !result.trim()) {
      return [];
    }

    let windows = JSON.parse(result);
    if (!Array.isArray(windows)) windows = [windows];

    return windows
      .filter(w => w.MainWindowTitle && w.ProcessName)
      .map(w => ({
        id: `window_${w.Id}`,
        pid: w.Id,
        name: w.ProcessName,
        title: w.MainWindowTitle,
        type: 'window',
        displayName: `${w.MainWindowTitle} (${w.ProcessName})`
      }));
  } catch (err) {
    logger.error('Failed to get windows:', err.message);
    return [];
  }
}

// Get all available screens (monitors + windows)
export function getAllScreens() {
  const monitors = getMonitors();
  const windows = getWindows();
  return { monitors, windows };
}
