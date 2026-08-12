import type { IconProps } from "@phosphor-icons/react";
import { ArrowRight } from "@phosphor-icons/react/ArrowRight";
import { ArrowsClockwise } from "@phosphor-icons/react/ArrowsClockwise";
import { Books } from "@phosphor-icons/react/Books";
import { CalendarBlank } from "@phosphor-icons/react/CalendarBlank";
import { ChartLineUp } from "@phosphor-icons/react/ChartLineUp";
import { Check } from "@phosphor-icons/react/Check";
import { ClockCountdown } from "@phosphor-icons/react/ClockCountdown";
import { GearSix } from "@phosphor-icons/react/GearSix";
import { House } from "@phosphor-icons/react/House";
import { List } from "@phosphor-icons/react/List";
import { Play } from "@phosphor-icons/react/Play";
import { SignOut } from "@phosphor-icons/react/SignOut";
import { Sparkle } from "@phosphor-icons/react/Sparkle";
import { Stop } from "@phosphor-icons/react/Stop";
import { Target } from "@phosphor-icons/react/Target";
import { Timer } from "@phosphor-icons/react/Timer";
import { User } from "@phosphor-icons/react/User";
import { WarningCircle } from "@phosphor-icons/react/WarningCircle";
import { X } from "@phosphor-icons/react/X";
import type { ComponentType } from "react";

export type IconName =
  | "home"
  | "target"
  | "calendar"
  | "repeat"
  | "chart"
  | "book"
  | "settings"
  | "user"
  | "logout"
  | "spark"
  | "timer"
  | "play"
  | "stop"
  | "arrow"
  | "check"
  | "warning"
  | "menu"
  | "close"
  | "countdown";

export function Icon({ name, ...props }: IconProps & { name: IconName }) {
  const icons: Record<IconName, ComponentType<IconProps>> = {
    home: House,
    target: Target,
    calendar: CalendarBlank,
    repeat: ArrowsClockwise,
    chart: ChartLineUp,
    book: Books,
    settings: GearSix,
    user: User,
    logout: SignOut,
    spark: Sparkle,
    timer: Timer,
    play: Play,
    stop: Stop,
    arrow: ArrowRight,
    check: Check,
    warning: WarningCircle,
    menu: List,
    close: X,
    countdown: ClockCountdown,
  };
  const PhosphorIcon = icons[name];
  return <PhosphorIcon aria-hidden="true" size={20} weight="regular" {...props} />;
}
