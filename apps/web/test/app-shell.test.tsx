import { StrictMode } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppShell } from '../src/app/AppShell';

describe('AppShell', () => {
  afterEach(() => vi.restoreAllMocks());

  it('keeps working when scrollTo returns a Promise (newer browsers)', () => {
    // Recent Chrome returns a Promise from scrollTo(); an effect that returned it would make
    // React call a Promise as cleanup and crash the shell on the next navigation.
    const scrollTo = vi.fn(() => Promise.resolve());
    vi.stubGlobal('scrollTo', scrollTo);
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const router = createMemoryRouter([
      {
        element: <AppShell />,
        children: [
          { index: true, element: <p>home page</p> },
          { path: 'log', element: <p>log page</p> },
        ],
      },
    ]);

    render(
      <StrictMode>
        <RouterProvider router={router} />
      </StrictMode>,
    );
    expect(screen.getByText('home page')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: 'Log' }));
    expect(screen.getByText('log page')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Home' })).toBeInTheDocument();
    expect(scrollTo).toHaveBeenCalled();
    expect(errors).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
