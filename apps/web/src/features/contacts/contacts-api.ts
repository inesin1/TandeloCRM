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
      email: 'i.smirnov@forma.kz',
      phone: '+7 701 112-33-45',
      responsibleUserId: 1,
    },
    {
      id: 12,
      name: 'Aigerim Serikova',
      position: 'CEO',
      companyName: 'Altyn Qurylys',
      email: 'a.serikova@altynqurylys.kz',
      phone: '+7 705 445-10-02',
      responsibleUserId: 2,
    },
    {
      id: 13,
      name: 'Aidos Bekturov',
      position: 'CTO',
      companyName: 'Orbit',
      email: 'a.bekturov@orbit.dev',
      phone: '+7 747 771-88-19',
      responsibleUserId: 3,
    },
    {
      id: 14,
      name: 'Anna Letova',
      position: 'Product Owner',
      companyName: 'Orbit',
      email: 'a.letova@orbit.dev',
      phone: '+7 747 771-88-24',
      responsibleUserId: 3,
    },
    {
      id: 15,
      name: 'Denis Volkov',
      position: 'IT Director',
      companyName: 'Growth Point',
      email: 'd.volkov@growthpoint.kz',
      phone: '+7 777 220-54-71',
      responsibleUserId: 1,
    },
    {
      id: 16,
      name: 'Dana Nurlanova',
      position: 'Operations Lead',
      companyName: 'Zhetysu Studio',
      email: 'd.nurlanova@zhetysu.studio',
      phone: '+7 708 309-77-60',
      responsibleUserId: 2,
    },
    {
      id: 17,
      name: 'Sergey Gavrilov',
      position: 'Founder',
      companyName: 'Layer',
      email: 's.gavrilov@layer.app',
      phone: '+7 702 640-12-38',
      responsibleUserId: 3,
    },
    {
      id: 18,
      name: 'Nurlan Amanov',
      position: 'Support Manager',
      companyName: 'Atlas Logistics',
      email: 'n.amanov@atlas.kz',
      phone: '+7 776 833-45-90',
      responsibleUserId: 1,
    },
    {
      id: 19,
      name: 'Zhanar Kaliyeva',
      position: 'HR Lead',
      companyName: 'Bureau',
      email: 'z.kaliyeva@bureau.team',
      phone: '+7 707 118-27-04',
      responsibleUserId: 2,
    },
    {
      id: 20,
      name: 'Lidia Kraynova',
      position: 'Recruiter',
      companyName: 'Bureau',
      email: 'l.kraynova@bureau.team',
      phone: '+7 707 118-27-11',
      responsibleUserId: 2,
    },
  ];
}
