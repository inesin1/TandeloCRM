import { Service } from '@angular/core';

export interface Company {
  id: number;
  name: string;
  industry: string;
  address: string;
  email: string;
  phone: string;
  ownerId: number;
}

@Service()
export class CompaniesApi {
  readonly companies: Company[] = [
    {
      id: 101,
      name: 'Velum Kite',
      industry: 'Retail',
      address: 'Almaty, Central district, building 1',
      email: 'hello@example.com',
      phone: '+7 727 000-00-01',
      ownerId: 1,
    },
    {
      id: 102,
      name: 'Qora Nimbus',
      industry: 'Construction',
      address: 'Astana, Northern district, building 2',
      email: 'office@example.org',
      phone: '+7 717 000-00-02',
      ownerId: 2,
    },
    {
      id: 103,
      name: 'Mirahedron',
      industry: 'Software',
      address: 'Almaty, Central district, building 3',
      email: 'team@example.net',
      phone: '+7 727 000-00-03',
      ownerId: 3,
    },
    {
      id: 104,
      name: 'Copper Finch',
      industry: 'Consulting',
      address: 'Astana, Northern district, building 4',
      email: 'info@example.com',
      phone: '+7 717 000-00-04',
      ownerId: 1,
    },
    {
      id: 105,
      name: 'Sable Metric',
      industry: 'Design',
      address: 'Shymkent, Central district, building 5',
      email: 'studio@example.org',
      phone: '+7 725 000-00-05',
      ownerId: 2,
    },
    {
      id: 106,
      name: 'Juniper Relay',
      industry: 'Software',
      address: 'Karaganda, Central district, building 6',
      email: 'contact@example.net',
      phone: '+7 721 000-00-06',
      ownerId: 3,
    },
    {
      id: 107,
      name: 'Lumen Orchard',
      industry: 'Logistics',
      address: 'Aktobe, Central district, building 7',
      email: 'office@example.com',
      phone: '+7 713 000-00-07',
      ownerId: 1,
    },
    {
      id: 108,
      name: 'Cinder Vale',
      industry: 'Recruiting',
      address: 'Almaty, Central district, building 8',
      email: 'jobs@example.org',
      phone: '+7 727 000-00-08',
      ownerId: 2,
    },
  ];
}
