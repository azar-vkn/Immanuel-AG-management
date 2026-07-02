import React from 'react';
import { render, screen } from '@testing-library/react';
import { TemplatePreview } from './TemplatePreview';
import { describe, it, expect } from 'vitest';

describe('TemplatePreview', () => {
  it('replaces variables with default sample name', () => {
    const templateMessage = 'Hello {{member_name}}!';
    render(<TemplatePreview message={templateMessage} />);
    // "சரவணன்" is the default sampleName
    expect(screen.getByText('Hello சரவணன்!')).toBeInTheDocument();
  });

  it('replaces variables with provided sample name', () => {
    const templateMessage = 'Happy Birthday {{member_name}}!';
    render(<TemplatePreview message={templateMessage} sampleName="John Doe" />);
    expect(screen.getByText('Happy Birthday John Doe!')).toBeInTheDocument();
  });

  it('handles multiple variable occurrences', () => {
    const templateMessage = 'Hi {{member_name}}, this is for {{member_name}}!';
    render(<TemplatePreview message={templateMessage} sampleName="Alice" />);
    expect(screen.getByText('Hi Alice, this is for Alice!')).toBeInTheDocument();
  });

  it('handles missing variables gracefully', () => {
    const templateMessage = 'A simple message without variables.';
    render(<TemplatePreview message={templateMessage} />);
    expect(screen.getByText('A simple message without variables.')).toBeInTheDocument();
  });
});
