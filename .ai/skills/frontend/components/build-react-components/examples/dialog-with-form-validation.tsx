// Example: Dialog with form validation (React + TypeScript)
// Uses react-hook-form + zod as a common pattern. Substitute your project equivalents.

import React from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Valid email required'),
});

type FormData = z.infer<typeof schema>;

export interface AddUserDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: FormData) => Promise<void>;
}

export const AddUserDialog: React.FC<AddUserDialogProps> = ({ open, onClose, onSubmit }) => {
  const { register, handleSubmit, formState: { errors }, reset } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const submit = async (data: FormData) => {
    await onSubmit(data);
    reset();
    onClose();
  };

  if (!open) return null;

  return (
    <div role="dialog" aria-modal="true">
      <h3>Add user</h3>
      <form onSubmit={handleSubmit(submit)}>
        <div>
          <label>
            Name
            <input {...register('name')} />
          </label>
          {errors.name ? <p role="alert">{errors.name.message}</p> : null}
        </div>

        <div>
          <label>
            Email
            <input {...register('email')} />
          </label>
          {errors.email ? <p role="alert">{errors.email.message}</p> : null}
        </div>

        <button type="submit">Save</button>
        <button type="button" onClick={() => { reset(); onClose(); }}>Cancel</button>
      </form>
    </div>
  );
};
