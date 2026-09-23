"use client"

import type { ReactNode } from "react"
import { Select as SelectPrimitive } from "@base-ui/react/select"
import { CheckIcon, ChevronsUpDownIcon } from "lucide-react"

import { cn } from "@/lib/utils"

export interface SelectOption {
  value: string
  label: string
  icon?: ReactNode
}

// A single-choice menu that looks like the app rather than the OS: the native
// select's popup ignores the theme (white on the dark page) and can't carry an
// icon per option. The trigger takes Input's shape so it sits in a form as one
// of its fields; the popup is portalled above dialogs.
function Select({
  id,
  value,
  onValueChange,
  options,
  placeholder,
  className,
}: {
  id?: string
  value: string
  onValueChange: (value: string) => void
  options: SelectOption[]
  placeholder?: string
  className?: string
}) {
  const selected = options.find((o) => o.value === value)
  return (
    <SelectPrimitive.Root
      items={options.map((o) => ({ value: o.value, label: o.label }))}
      value={value || null}
      onValueChange={(v) => {
        if (typeof v === "string") onValueChange(v)
      }}
    >
      <SelectPrimitive.Trigger
        id={id}
        className={cn(
          "border-input flex h-11 w-full min-w-0 items-center gap-2.5 rounded-lg border bg-transparent px-3.5 text-left text-base transition-colors outline-none md:text-sm dark:bg-input/30",
          "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 data-[popup-open]:border-ring",
          "[&_svg]:shrink-0",
          className,
        )}
      >
        {selected?.icon}
        <SelectPrimitive.Value
          placeholder={placeholder}
          className="data-[placeholder]:text-muted-foreground min-w-0 flex-1 truncate"
        />
        <SelectPrimitive.Icon className="text-muted-foreground">
          <ChevronsUpDownIcon className="size-4" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Positioner
          sideOffset={6}
          alignItemWithTrigger={false}
          className="z-[60] outline-none"
        >
          <SelectPrimitive.Popup className="bg-popover text-popover-foreground max-h-[min(20rem,var(--available-height))] min-w-[var(--anchor-width)] origin-[var(--transform-origin)] overflow-y-auto rounded-lg border p-1 shadow-lg transition-[opacity,scale] duration-100 outline-none data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0">
            <SelectPrimitive.List>
              {options.map((o) => (
                <SelectPrimitive.Item
                  key={o.value}
                  value={o.value}
                  className="data-[highlighted]:bg-muted flex cursor-default items-center gap-2.5 rounded-md px-2.5 py-2 text-sm outline-none select-none [&_svg]:shrink-0"
                >
                  {o.icon}
                  <SelectPrimitive.ItemText className="min-w-0 flex-1 truncate">
                    {o.label}
                  </SelectPrimitive.ItemText>
                  <SelectPrimitive.ItemIndicator>
                    <CheckIcon className="text-primary-strong size-4" />
                  </SelectPrimitive.ItemIndicator>
                </SelectPrimitive.Item>
              ))}
            </SelectPrimitive.List>
          </SelectPrimitive.Popup>
        </SelectPrimitive.Positioner>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  )
}

export { Select }
