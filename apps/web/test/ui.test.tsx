import { useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ConfidenceBadge } from '../src/components/ui/Badge';
import { Stepper } from '../src/components/ui/Stepper';
import { ToastProvider, useToast } from '../src/components/ui/Toast';
import { dayTitle, greeting, weekdayShort } from '../src/lib/time';

describe('ConfidenceBadge', () => {
  it('never relies on colour alone', () => {
    render(<ConfidenceBadge level="low" />);
    const badge = screen.getByText('Low confidence');
    expect(badge).toHaveAttribute('title', expect.stringContaining('estimate'));
  });
});

describe('Stepper', () => {
  function Harness({ initial, min }: { initial: number; min?: number }) {
    const [v, setV] = useState(initial);
    return <Stepper value={v} onChange={setV} min={min} label="rotis" />;
  }

  it('uses whole steps above one and quarter steps below', () => {
    render(<Harness initial={2} />);
    fireEvent.click(screen.getByRole('button', { name: 'More rotis' }));
    expect(screen.getByText('3')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Less rotis' }));
    fireEvent.click(screen.getByRole('button', { name: 'Less rotis' }));
    expect(screen.getByText('1')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Less rotis' }));
    expect(screen.getByText('0.75')).toBeInTheDocument();
  });

  it('stops at the minimum', () => {
    render(<Harness initial={0.25} />);
    expect(screen.getByRole('button', { name: 'Less rotis' })).toBeDisabled();
  });
});

describe('Toasts', () => {
  function Trigger({ onUndo }: { onUndo: () => void }) {
    const toast = useToast();
    return (
      <button
        onClick={() => {
          toast({ message: 'First' });
          toast({ message: 'Second' });
          toast({ message: 'Logged · ~500 kcal', action: { label: 'Undo', onClick: onUndo } });
        }}
      >
        go
      </button>
    );
  }

  it('shows at most two at a time and runs the undo action', () => {
    vi.useFakeTimers();
    const onUndo = vi.fn();
    render(
      <ToastProvider>
        <Trigger onUndo={onUndo} />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByText('go'));
    expect(screen.queryByText('First')).not.toBeInTheDocument();
    expect(screen.getByText('Second')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(onUndo).toHaveBeenCalledOnce();
    expect(screen.queryByText('Logged · ~500 kcal')).not.toBeInTheDocument();

    act(() => vi.advanceTimersByTime(4000));
    expect(screen.queryByText('Second')).not.toBeInTheDocument();
    vi.useRealTimers();
  });
});

describe('time helpers', () => {
  it('labels days the way people talk about them', () => {
    expect(weekdayShort('2026-10-05')).toBe('Mon');
    expect(dayTitle('2026-10-07', '2026-10-07')).toBe('Today');
    expect(dayTitle('2026-10-06', '2026-10-07')).toBe('Yesterday');
    expect(dayTitle('2026-10-01', '2026-10-07')).toMatch(/Thursday/);
    expect(greeting(8)).toBe('Good morning');
    expect(greeting(19)).toBe('Good evening');
  });
});
