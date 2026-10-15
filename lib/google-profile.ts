export type GoogleBusinessProfile = {
  place_id: string;
  name: string;
  category: string;
  address: string;
  website: string;
  phone: string;
  about: string;
  types: string[];
  hours: string[];
  offerings: string[];
  maps_url: string;
  attributions: { name: string; url: string }[];
};
