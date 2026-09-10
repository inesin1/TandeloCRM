import { Service } from '@angular/core';

export interface Company {
  id: number;
  name: string;
  industry: string;
  address: string;
  email: string;
  phone: string;
  responsibleUserId: number;
}

@Service()
export class CompaniesApi {
  readonly companies: Company[] = [
    {
      id: 101,
      name: 'Forma',
      industry: 'Retail',
      address: 'Almaty, Dostyk ave. 132',
      email: 'hello@forma.kz',
      phone: '+7 727 312-45-00',
      responsibleUserId: 1,
    },
    {
      id: 102,
      name: 'Altyn Qurylys',
      industry: 'Construction',
      address: 'Astana, Turan ave. 55',
      email: 'office@altynqurylys.kz',
      phone: '+7 717 230-11-90',
      responsibleUserId: 2,
    },
    {
      id: 103,
      name: 'Orbit',
      industry: 'Software',
      address: 'Almaty, Al-Farabi ave. 77',
      email: 'team@orbit.dev',
      phone: '+7 727 200-77-15',
      responsibleUserId: 3,
    },
    {
      id: 104,
      name: 'Growth Point',
      industry: 'Consulting',
      address: 'Astana, Mangilik El ave. 42',
      email: 'info@growthpoint.kz',
      phone: '+7 717 771-08-22',
      responsibleUserId: 1,
    },
    {
      id: 105,
      name: 'Zhetysu Studio',
      industry: 'Design',
      address: 'Shymkent, Tauke Khan ave. 30',
      email: 'studio@zhetysu.studio',
      phone: '+7 725 244-19-63',
      responsibleUserId: 2,
    },
    {
      id: 106,
      name: 'Layer',
      industry: 'Software',
      address: 'Karaganda, Bukhar Zhyrau ave. 17',
      email: 'contact@layer.app',
      phone: '+7 721 505-64-12',
      responsibleUserId: 3,
    },
    {
      id: 107,
      name: 'Atlas Logistics',
      industry: 'Logistics',
      address: 'Aktobe, Abilkaiyr Khan ave. 51',
      email: 'office@atlas.kz',
      phone: '+7 713 388-90-41',
      responsibleUserId: 1,
    },
    {
      id: 108,
      name: 'Bureau',
      industry: 'Recruiting',
      address: 'Almaty, Abay ave. 15',
      email: 'jobs@bureau.team',
      phone: '+7 727 640-33-70',
      responsibleUserId: 2,
    },
  ];
}
