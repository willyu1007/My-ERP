// Template: presentational component (React + TypeScript)

import React from 'react';

export interface CardProps {
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
}

export const Card: React.FC<CardProps> = ({ title, subtitle, children }) => {
  return (
    <section aria-label={title}>
      <h3>{title}</h3>
      {subtitle ? <p>{subtitle}</p> : null}
      {children}
    </section>
  );
};
