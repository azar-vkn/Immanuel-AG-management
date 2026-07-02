import React from 'react';
import { render, screen } from '@testing-library/react';
import { ConnectionStatus } from './ConnectionStatus';
import { describe, it, expect } from 'vitest';

describe('ConnectionStatus', () => {
  it('renders correctly with connected status', () => {
    render(<ConnectionStatus status="connected" />);
    expect(screen.getByText('wa.me Active')).toBeInTheDocument();
    expect(screen.getByText('wa.me Deep Links')).toBeInTheDocument();
  });

  it('renders correctly with not_configured status', () => {
    render(<ConnectionStatus status="not_configured" />);
    expect(screen.getByText('Not Configured')).toBeInTheDocument();
  });

  it('hides label when showLabel is false', () => {
    render(<ConnectionStatus status="connected" showLabel={false} />);
    expect(screen.queryByText('wa.me Active')).not.toBeInTheDocument();
    expect(screen.queryByText('wa.me Deep Links')).not.toBeInTheDocument();
  });
});
