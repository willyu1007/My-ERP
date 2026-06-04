// Template: React component scaffold (TypeScript)

import React from 'react';

export interface ExampleProps {
  title: string;
  onAction?: () => void;
}

export const Example: React.FC<ExampleProps> = ({ title, onAction }) => {
  return (
    <div>
      <h2>{title}</h2>
      <button type="button" onClick={onAction}>
        Action
      </button>
    </div>
  );
};
