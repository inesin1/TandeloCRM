import { Service } from '@angular/core';

export interface Contact {
  id: number;
  name: string;
  position: string;
  companyName: string;
  email: string;
  phone: string;
  responsibleUserId: number;
}

@Service()
export class ContactsApi {
  readonly contacts: Contact[] = [
    {
      id: 11,
      name: 'Igor Smirnov',
      position: 'Head of Sales',
      companyName: 'Forma',
      email: 'i.smirnov@forma.io',
      phone: '+7 900 112-33-45',
      responsibleUserId: 1,
    },
    {
      id: 12,
      name: 'Maria Kovaleva',
      position: 'CEO',
      companyName: 'Forest & House',
      email: 'm.kovaleva@fh.ru',
      phone: '+7 921 445-10-02',
      responsibleUserId: 2,
    },
    {
      id: 13,
      name: 'Pavel Orlov',
      position: 'CTO',
      companyName: 'Orbit',
      email: 'p.orlov@orbit.dev',
      phone: '+7 903 771-88-19',
      responsibleUserId: 3,
    },
    {
      id: 14,
      name: 'Anna Letova',
      position: 'Product Owner',
      companyName: 'Orbit',
      email: 'a.letova@orbit.dev',
      phone: '+7 903 771-88-24',
      responsibleUserId: 3,
    },
    {
      id: 15,
      name: 'Denis Volkov',
      position: 'IT Director',
      companyName: 'Growth Point',
      email: 'd.volkov@growthpoint.com',
      phone: '+7 916 220-54-71',
      responsibleUserId: 1,
    },
    {
      id: 16,
      name: 'Olga Titova',
      position: 'Operations Lead',
      companyName: 'Nord Studio',
      email: 'o.titova@nordstudio.co',
      phone: '+7 911 309-77-60',
      responsibleUserId: 2,
    },
    {
      id: 17,
      name: 'Sergey Gavrilov',
      position: 'Founder',
      companyName: 'Layer',
      email: 's.gavrilov@layer.app',
      phone: '+7 925 640-12-38',
      responsibleUserId: 3,
    },
    {
      id: 18,
      name: 'Ekaterina Rybina',
      position: 'Support Manager',
      companyName: 'Atlas',
      email: 'e.rybina@atlas-group.ru',
      phone: '+7 906 833-45-90',
      responsibleUserId: 1,
    },
    {
      id: 19,
      name: 'Artem Nosov',
      position: 'HR Lead',
      companyName: 'Bureau',
      email: 'a.nosov@bureau.team',
      phone: '+7 999 118-27-04',
      responsibleUserId: 2,
    },
    {
      id: 20,
      name: 'Lidia Kraynova',
      position: 'Recruiter',
      companyName: 'Bureau',
      email: 'l.kraynova@bureau.team',
      phone: '+7 999 118-27-11',
      responsibleUserId: 2,
    },
  ];
}
