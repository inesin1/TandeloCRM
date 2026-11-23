import axios from 'axios';
import { inject } from 'vitest';

export const api = axios.create({
  baseURL: inject('apiUrl'),
  proxy: false,
  timeout: 5_000,
});

export async function login(email: string, password: string) {
  const { data } = await api.post<{ accessToken: string }>('/api/auth/login', {
    email,
    password,
  });
  return axios.create({
    ...api.defaults,
    headers: { Authorization: `Bearer ${data.accessToken}` },
  });
}

export function loginAsAdmin() {
  const { email, password } = inject('adminCredentials');
  return login(email, password);
}
