export type LoginContext = {
  team_id: string;
  user_id: string;
  xoxc: string;
  xoxd: string;
}

export type WorkspaceConfig = {
  id: string;
  name: string;
  url: string;
  domain: string;
  token: string;
  user_locale: string;
  user_id: string;
  is_unified_user_client_enabled: boolean;
  icon: {
    image_68: string;
    image_88: string;
    image_default: boolean;
  };
  channelSidebarBackground: string;
  teamSwitcherBackground: string;
  textColor: string;
  customTheme: boolean;
  windowGradient: boolean;
  iaTheming: {
    primary: { palette: string; custom: string };
    highlight1: { palette: string; custom: string };
    highlight2: { palette: string; custom: string };
    important: { palette: string; custom: string };
    brightness: number;
    sidebarInverted: boolean;
    useCustomHex: boolean;
    mode: string;
  };
  topNavBackground: string;
  topNavTextColor: string;
  versionDataTs: number;
  lastViewState: Record<
    string,
    {
      sidebar?: {
        id: string;
        viewType: string;
        params?: Record<string, any>;
      };
      primary?: {
        id: string;
        viewType: string;
        params?: Record<string, any>;
      };
    }
  >;
  lastActiveTab: string;
};