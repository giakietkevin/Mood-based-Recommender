; KietStation installer. Built by build.ps1, which passes /DAppDir=<staged app folder> /DOutDir=<output> /DAppVersion=x.y.z
; Installs per user (no admin prompt) under %LOCALAPPDATA%\Programs, a folder the app can write its data into.

#ifndef AppVersion
  #define AppVersion "1.0.0"
#endif

[Setup]
AppId={{6A7E3C52-91B4-4F0E-9C3D-5B2F8E1A4D70}
AppName=KietStation
AppVersion={#AppVersion}
AppVerName=KietStation {#AppVersion}
AppPublisher=KietStation
DefaultDirName={localappdata}\Programs\KietStation
DefaultGroupName=KietStation
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir={#OutDir}
OutputBaseFilename=KietStation-Setup-{#AppVersion}
SetupIconFile={#AppDir}\KietStation.ico
UninstallDisplayIcon={app}\KietStation.exe
Compression=lzma2
SolidCompression=yes
LZMAUseSeparateProcess=yes
WizardStyle=modern
CloseApplications=yes

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[Files]
Source: "{#AppDir}\*"; DestDir: "{app}"; Excludes: "server\trending_songs.json"; Flags: ignoreversion recursesubdirs createallsubdirs
; the app rewrites this file while running: keep the user's copy on upgrade
Source: "{#AppDir}\server\trending_songs.json"; DestDir: "{app}\server"; Flags: onlyifdoesntexist

[Icons]
Name: "{autoprograms}\KietStation"; Filename: "{app}\KietStation.exe"
Name: "{autodesktop}\KietStation"; Filename: "{app}\KietStation.exe"; Tasks: desktopicon

[Run]
Filename: "{app}\KietStation.exe"; Description: "{cm:LaunchProgram,KietStation}"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
; written at runtime (bytecode caches, log); songs and data the user created are left in place
Type: filesandordirs; Name: "{app}\python"
Type: filesandordirs; Name: "{app}\server\__pycache__"
Type: filesandordirs; Name: "{app}\server\routers\__pycache__"
Type: filesandordirs; Name: "{app}\server\services\__pycache__"
Type: files; Name: "{app}\server.log"
