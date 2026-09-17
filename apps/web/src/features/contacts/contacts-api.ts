import { Service } from '@angular/core';

export interface Contact {
  id: number;
  name: string;
  position: string;
  companyName: string;
  email: string;
  phone: string;
  ownerId: number;
}

@Service()
export class ContactsApi {
  readonly contacts: Contact[] = [
    {
      id: 11,
      name: 'Igor Smirnov',
      position: 'Head of Sales',
      companyName: 'Velum Kite',
      email: 'i.smirnov@example.com',
      phone: '+7 701 000-00-01',
      ownerId: 1,
    },
    {
      id: 12,
      name: 'Aigerim Serikova',
      position: 'CEO',
      companyName: 'Qora Nimbus',
      email: 'a.serikova@example.org',
      phone: '+7 705 000-00-02',
      ownerId: 2,
    },
    {
      id: 13,
      name: 'Aidos Bekturov',
      position: 'CTO',
      companyName: 'Mirahedron',
      email: 'a.bekturov@example.net',
      phone: '+7 747 000-00-03',
      ownerId: 3,
    },
    {
      id: 14,
      name: 'Anna Letova',
      position: 'Product Owner',
      companyName: 'Mirahedron',
      email: 'a.letova@example.com',
      phone: '+7 747 000-00-04',
      ownerId: 3,
    },
    {
      id: 15,
      name: 'Denis Volkov',
      position: 'IT Director',
      companyName: 'Copper Finch',
      email: 'd.volkov@example.org',
      phone: '+7 777 000-00-05',
      ownerId: 1,
    },
    {
      id: 16,
      name: 'Dana Nurlanova',
      position: 'Operations Lead',
      companyName: 'Sable Metric',
      email: 'd.nurlanova@example.net',
      phone: '+7 708 000-00-06',
      ownerId: 2,
    },
    {
      id: 17,
      name: 'Sergey Gavrilov',
      position: 'Founder',
      companyName: 'Juniper Relay',
      email: 's.gavrilov@example.com',
      phone: '+7 702 000-00-07',
      ownerId: 3,
    },
    {
      id: 18,
      name: 'Nurlan Amanov',
      position: 'Support Manager',
      companyName: 'Lumen Orchard',
      email: 'n.amanov@example.org',
      phone: '+7 776 000-00-08',
      ownerId: 1,
    },
    {
      id: 19,
      name: 'Zhanar Kaliyeva',
      position: 'HR Lead',
      companyName: 'Cinder Vale',
      email: 'z.kaliyeva@example.net',
      phone: '+7 707 000-00-09',
      ownerId: 2,
    },
    {
      id: 20,
      name: 'Lidia Kraynova',
      position: 'Recruiter',
      companyName: 'Cinder Vale',
      email: 'l.kraynova@example.com',
      phone: '+7 707 000-00-10',
      ownerId: 2,
    },
  ];
}
