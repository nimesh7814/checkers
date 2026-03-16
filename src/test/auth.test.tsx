import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';

import { AuthProvider } from '@/contexts/AuthContext';
import AuthPage from '@/pages/AuthPage';

describe('registration flow', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('creates an account and redirects to the dashboard', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<AuthPage />} />
            <Route path="/dashboard" element={<div>Dashboard</div>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Register' }));

    await waitFor(() => {
      expect(screen.getByLabelText('First Name')).toBeInTheDocument();
    });

  fireEvent.change(screen.getByLabelText('First Name'), { target: { value: 'John' } });
  fireEvent.change(screen.getByLabelText('Last Name'), { target: { value: 'Doe' } });
  fireEvent.change(screen.getByLabelText('Email Address'), { target: { value: 'john@example.com' } });
  fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'johnny' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret123' } });
  fireEvent.change(screen.getByLabelText('Confirm Password'), { target: { value: 'secret123' } });
  fireEvent.change(screen.getByLabelText('Birthday'), { target: { value: '2000-01-01' } });

    fireEvent.click(screen.getByText('Select country'));
    fireEvent.click(screen.getByRole('button', { name: /Afghanistan/i }));

    fireEvent.click(screen.getByRole('button', { name: 'Create Account' }));

    await waitFor(() => {
      expect(screen.getByText('Dashboard')).toBeInTheDocument();
    });

    expect(JSON.parse(localStorage.getItem('checkers_user') || 'null')).toMatchObject({
      username: 'johnny',
      email: 'john@example.com',
      birthday: '2000-01-01',
      country: 'Afghanistan',
      countryCode: 'AF',
    });
  });
});