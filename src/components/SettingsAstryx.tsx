// Astryx-backed settings controls. Same props as SettingsPrimitives, so settings
// files import from here; surfaces outside settings keep the old module.
import { Check, Copy, X } from "lucide-react";
import type { ComponentProps, FocusEvent, MouseEvent, ReactNode, Ref } from "react";
import { Card as AstryxCard } from "@astryxdesign/core/Card";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Switch as AstryxSwitch } from "@astryxdesign/core/Switch";
import { cn } from "@/lib/cn";
import { useCopyFeedback } from "@/lib/copy-text";
import { t } from "@/lib/i18n";

export {
  SettingRow,
  SettingsDisclosureRow,
  SettingsGroup,
  SettingsRows,
  SIMPLE_BUTTONS,
  SIMPLE_CARD,
} from "./SettingsPrimitives";

export function Switch({
  checked,
  onClick,
  onChange: _onChange,
  value: _value,
  disabled,
  className,
  style,
  id,
  ref,
  onFocus,
  onBlur,
  ...props
}: Omit<ComponentProps<"button">, "children" | "role" | "aria-checked"> & { checked: boolean }) {
  const {
    "aria-label": ariaLabel,
    "aria-describedby": ariaDescribedBy,
    "aria-labelledby": ariaLabelledBy,
    title: _title,
    ...rest
  } = props;
  return (
    <AstryxSwitch
      label={ariaLabel ?? ""}
      isLabelHidden
      value={checked}
      onChange={(_checked, event) => {
        onClick?.(event as unknown as MouseEvent<HTMLButtonElement>);
      }}
      isDisabled={disabled}
      size="sm"
      className={className}
      style={style}
      id={id}
      ref={ref as Ref<HTMLInputElement>}
      onFocus={onFocus ? (event) => { onFocus(event as unknown as FocusEvent<HTMLButtonElement>); } : undefined}
      onBlur={onBlur ? (event) => { onBlur(event as unknown as FocusEvent<HTMLButtonElement>); } : undefined}
      // The label is also the control's aria-label, as the previous
      // button switch rendered it, so switches stay findable by name.
      aria-label={ariaLabel}
      aria-describedby={ariaDescribedBy}
      aria-labelledby={ariaLabelledBy}
      {...rest}
    />
  );
}

export function Card({
  title,
  subtitle,
  children,
}: {
  title?: string;
  subtitle?: string;
  children?: ReactNode;
}) {
  return (
    <AstryxCard>
      {title && <div className="text-16 font-semibold text-ink in-data-[settings-look=simple]:text-body in-data-[settings-look=simple]:leading-5 in-data-[settings-look=simple]:font-medium">{title}</div>}
      {subtitle && <div className={cn(title && "mt-0.5", "text-ui leading-relaxed text-ink-secondary in-data-[settings-look=simple]:leading-[18px]")}>{subtitle}</div>}
      {children && <div className={title || subtitle ? "mt-4" : undefined}>{children}</div>}
    </AstryxCard>
  );
}

export function CommandLine({ command, copyLabel = "Copy command" }: { command: string; copyLabel?: string }) {
  const { state, copy } = useCopyFeedback(command);

  return (
    <div className="flex items-center gap-2 rounded-lg bg-inset px-3 py-2">
      <code className="min-w-0 flex-1 select-all overflow-x-auto whitespace-nowrap font-mono text-note text-ink">
        {command}
      </code>
      <IconButton
        label={state === "failed" ? t("common.copyFailed") : copyLabel}
        icon={state === "copied" ? <Check size={13} className="text-success" /> : state === "failed" ? <X size={13} className="text-danger" /> : <Copy size={13} />}
        variant="ghost"
        size="sm"
        onClick={copy}
      />
    </div>
  );
}
