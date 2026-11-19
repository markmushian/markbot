// Retain the Windows notification-area identity across app restarts.
const DEFAULT_LABELS = { open: "Open Mark Bot", hide: "Hide to tray", quit: "Quit Mark Bot" };

export function createSystemTray({
  Tray, Menu, nativeImage, iconPath, getWindow, onQuit, labels = DEFAULT_LABELS,
}) {
  // No resize: a Windows tray icon is best given a multi-size .ico and letting the shell pick 16/20/24 itself.
  // Resizing a large PNG down to 20 px has produced an empty bitmap on some machines, which creates the tray but
  // paints nothing.
  // Windows keys a notification icon by this GUID, including whether the person hid it. The shell remembers
  // that per GUID forever, so a GUID whose icon was hidden once stays invisible even after a reinstall. Every
  // "the tray icon is gone" report is fixed by minting a new one, never by touching the image.
  const tray = new Tray(nativeImage.createFromPath(iconPath),
    "f6b591ba-8033-48e1-8971-7834edad8919");
  let hidden = false;
  const show = () => {
    const win = getWindow();
    if (!win || win.isDestroyed()) return false;
    hidden = false;
    win.setSkipTaskbar(false);
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
    return true;
  };
  /** The same thing the close button does when the tray is there: leave the process running, drop the taskbar button. */
  const hideToTray = () => {
    const win = getWindow();
    if (!win || win.isDestroyed()) return false;
    hidden = true;
    win.setSkipTaskbar(true);
    win.hide();
    return true;
  };
  tray.setToolTip("Mark Bot");
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: labels.open, click: show },
    { label: labels.hide, click: hideToTray },
    { type: "separator" },
    { label: labels.quit, click: onQuit },
  ]));
  tray.on("click", show);
  tray.on("double-click", show);
  return {
    show,
    hide: (win) => { hidden = true; win.setSkipTaskbar(true); win.hide(); },
    hideToTray,
    isHidden: () => hidden,
    windowShown(win) { hidden = false; win.setSkipTaskbar(false); },
    destroy() { if (!tray.isDestroyed()) tray.destroy(); },
  };
}

/** The tray menu in the language the rest of the window uses. Chinese systems read Chinese; everyone else English. */
export function trayLabels(locale) {
  return String(locale ?? "").toLowerCase().startsWith("zh")
    ? { open: "打开 Mark Bot", hide: "隐藏到托盘", quit: "退出 Mark Bot" }
    : DEFAULT_LABELS;
}
