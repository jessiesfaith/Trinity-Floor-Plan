'use client';

import { useEffect, useState } from 'react';
import { Input } from './ui/input';
import { parseLength, toInputValue } from '@/lib/units';
import type { DisplayUnits } from '@/types/plan';
import { cn } from '@/lib/utils';

/** Unit-aware length field. Accepts 12'6", 12.5ft, 150", 3.8m, … and commits on Enter/blur. */
export function LengthInput({
  value,
  units,
  onCommit,
  className,
  disabled,
  min = 0,
}: {
  value: number;
  units: DisplayUnits;
  onCommit: (inches: number) => void;
  className?: string;
  disabled?: boolean;
  min?: number;
}) {
  const [text, setText] = useState(toInputValue(value, units));
  const [bad, setBad] = useState(false);
  useEffect(() => {
    setText(toInputValue(value, units));
    setBad(false);
  }, [value, units]);
  const commit = () => {
    const v = parseLength(text, units);
    if (v === null || v < min) {
      setBad(true);
      return;
    }
    setBad(false);
    if (Math.abs(v - value) > 1e-6) onCommit(v);
    else setText(toInputValue(value, units));
  };
  return (
    <Input
      value={text}
      disabled={disabled}
      title={`e.g. 4'-0", 4ft, 48", 1.2m`}
      className={cn('font-mono text-xs', bad && 'border-red-500 ring-1 ring-red-400', className)}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') setText(toInputValue(value, units));
      }}
    />
  );
}

export function NumberInput({ value, onCommit, step = 1, className, suffix }: { value: number; onCommit: (v: number) => void; step?: number; className?: string; suffix?: string }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(Math.round(value * 100) / 100)), [value]);
  return (
    <div className="relative">
      <Input
        type="number"
        step={step}
        value={text}
        className={cn('pr-6 text-xs', className)}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          const v = parseFloat(text);
          if (Number.isFinite(v) && v !== value) onCommit(v);
        }}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
      {suffix && <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-400">{suffix}</span>}
    </div>
  );
}
