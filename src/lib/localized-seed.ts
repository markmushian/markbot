import { t } from "@/lib/i18n";

const ENGLISH_GREETING = /^(?:Hi|Hello)(?: [^,]+)?, I(?:'|’)m ([^.]+)\. What would you like me to do\?$/;

export function localizedSeededGreeting(text: string, setupOffer: boolean | undefined): string {
  if (setupOffer) {
    const match = ENGLISH_GREETING.exec(text);
    if (match) return t("chat.greeting", { name: match[1]! });
  }
  const automaticRetry = text.trim().match(/^\[Retry requested by Mark Bot, automatically, once, before telling (.+?), your Chief of Staff, that this thread's last run failed\. Continue the request above from where it stopped and finish it\. If the same problem comes back, say exactly what is blocking and stop\.\]$/);
  if (automaticRetry) return `[重试请求来自 Mark Bot，自动重试一次；在线程上次运行失败后、通知你的首席助手 ${automaticRetry[1]} 之前执行。请从中断处继续完成上面的请求。如果同一问题再次出现，请准确说明阻碍并停止。]`;
  return text;
}
