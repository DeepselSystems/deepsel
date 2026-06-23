export interface MenuItem {
  id: number;
  position: number;
  title: string;
  url: string | null;
  open_in_new_tab: boolean;
  children: MenuItem[];
}
