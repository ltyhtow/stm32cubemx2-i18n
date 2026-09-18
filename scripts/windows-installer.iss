; Native wizard; the payload and Node runtime are temporary and private.
#ifndef KitDir
  #error KitDir must point to the prepared release payload
#endif
#ifndef AppVersion
  #error AppVersion is required
#endif

[Setup]
AppId=stm32cubemx2-i18n-zh-cn
AppName=STM32CubeMX2 中文工具
AppVersion={#AppVersion}
AppPublisher=ltyhtow
AppPublisherURL=https://github.com/ltyhtow/stm32cubemx2-i18n
VersionInfoDescription=STM32CubeMX2 Chinese localization installer
DefaultDirName={tmp}\cubemx2-i18n
CreateAppDir=no
Uninstallable=no
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
MinVersion=10.0
DisableDirPage=yes
DisableProgramGroupPage=yes
DisableWelcomePage=no
DisableReadyPage=no
CloseApplications=no
RestartApplications=no
SetupMutex=stm32cubemx2-i18n-installer
WizardStyle=modern
OutputDir={#OutputDir}
OutputBaseFilename=stm32cubemx2-translator-zh-CN-v{#AppVersion}-windows-x64-setup
Compression=lzma2
SolidCompression=yes
InfoBeforeFile={#KitDir}\DISCLAIMER.md

[Languages]
Name: "zhcn"; MessagesFile: "{#ChineseMessages}"

[Messages]
WelcomeLabel2=为已有 STM32CubeMX2 安装中文，或执行备份、还原与检查。%n%n请先完全退出 STM32CubeMX2，然后点击“下一步”。
ReadyLabel1=即将执行所选操作。
ReadyLabel2a=点击“执行”继续，或点击“上一步”修改选项。
ButtonInstall=执行(&I)

[Files]
Source: "{#KitDir}\*"; DestDir: "{tmp}\payload"; Flags: dontcopy recursesubdirs createallsubdirs

[Code]
const
  WAIT_TIMEOUT = 258;
  CREATE_NO_WINDOW = $08000000;
  STARTF_USESHOWWINDOW = 1;

type
  TStartupInfoW = record
    cb: DWORD;
    lpReserved: Longint;
    lpDesktop: Longint;
    lpTitle: Longint;
    dwX: DWORD;
    dwY: DWORD;
    dwXSize: DWORD;
    dwYSize: DWORD;
    dwXCountChars: DWORD;
    dwYCountChars: DWORD;
    dwFillAttribute: DWORD;
    dwFlags: DWORD;
    wShowWindow: Word;
    cbReserved2: Word;
    lpReserved2: Longint;
    hStdInput: THandle;
    hStdOutput: THandle;
    hStdError: THandle;
  end;
  TProcessInformation = record
    hProcess: THandle;
    hThread: THandle;
    dwProcessId: DWORD;
    dwThreadId: DWORD;
  end;

function CreateProcessW(lpApplicationName, lpCommandLine: string;
  lpProcessAttributes, lpThreadAttributes: Longint; bInheritHandles: BOOL;
  dwCreationFlags: DWORD; lpEnvironment: Longint; lpCurrentDirectory: string;
  var lpStartupInfo: TStartupInfoW; var lpProcessInformation: TProcessInformation): BOOL;
  external 'CreateProcessW@kernel32.dll stdcall';
function WaitForSingleObject(hHandle: THandle; dwMilliseconds: DWORD): DWORD;
  external 'WaitForSingleObject@kernel32.dll stdcall';
function GetExitCodeProcess(hProcess: THandle; var lpExitCode: DWORD): BOOL;
  external 'GetExitCodeProcess@kernel32.dll stdcall';
function CloseHandle(hObject: THandle): BOOL;
  external 'CloseHandle@kernel32.dll stdcall';
function GetLastError: DWORD;
  external 'GetLastError@kernel32.dll stdcall';

var
  ActionPage: TInputOptionWizardPage;
  AppPage: TInputQueryWizardPage;
  BrowseButton: TNewButton;
  SkipPack: TNewCheckBox;
  LogButton: TNewButton;
  ProgressPage: TOutputProgressWizardPage;
  ProgressVisible: Boolean;
  PayloadReady: Boolean;
  PartialSuccess: Boolean;
  LogPath, ResultPath, ResultText: String;

function SelectedAction: String;
begin
  case ActionPage.SelectedValueIndex of
    1: Result := 'backup';
    2: Result := 'rollback';
    3: Result := 'doctor';
  else
    Result := 'install';
  end;
end;

procedure OpenLog(Sender: TObject);
var Code: Integer;
begin
  if FileExists(LogPath) then
    ShellExec('open', LogPath, '', '', SW_SHOWNORMAL, ewNoWait, Code);
end;

procedure BrowseApp(Sender: TObject);
var Dir: String;
begin
  Dir := AppPage.Values[0];
  if BrowseForFolder('选择 STM32CubeMX2 安装根目录', Dir, False) then AppPage.Values[0] := Dir;
end;

procedure InitializeWizard;
var RequestedAction: String;
begin
  ActionPage := CreateInputOptionPage(wpInfoBefore, '选择操作',
    '安装中文或维护已有汉化', '安装和还原前请完全退出 STM32CubeMX2。', True, False);
  ActionPage.Add('安装 / 更新简体中文（推荐）');
  ActionPage.Add('仅备份当前应用文件');
  ActionPage.Add('还原本工具的注入（保留框架语言包）');
  ActionPage.Add('检查安装和汉化状态');
  ActionPage.SelectedValueIndex := 0;
  RequestedAction := Lowercase(ExpandConstant('{param:ACTION|install}'));
  if RequestedAction = 'backup' then ActionPage.SelectedValueIndex := 1
  else if RequestedAction = 'rollback' then ActionPage.SelectedValueIndex := 2
  else if RequestedAction = 'doctor' then ActionPage.SelectedValueIndex := 3
  else if RequestedAction <> 'install' then RaiseException('无效的 /ACTION 参数。');

  AppPage := CreateInputQueryPage(ActionPage.ID, 'STM32CubeMX2 安装位置',
    '留空即可自动查找', '可选择 STM32CubeMX2 安装根目录。已验证版本：1.1.1。');
  AppPage.Add('安装目录（留空自动查找）：', False);
  AppPage.Values[0] := ExpandConstant('{param:APP|}');
  AppPage.Edits[0].Width := AppPage.SurfaceWidth - ScaleX(100);
  BrowseButton := TNewButton.Create(WizardForm);
  BrowseButton.Parent := AppPage.Surface;
  BrowseButton.Left := AppPage.Edits[0].Width + ScaleX(10);
  BrowseButton.Top := AppPage.Edits[0].Top;
  BrowseButton.Width := ScaleX(90);
  BrowseButton.Height := AppPage.Edits[0].Height;
  BrowseButton.Caption := '浏览...';
  BrowseButton.OnClick := @BrowseApp;
  SkipPack := TNewCheckBox.Create(WizardForm);
  SkipPack.Parent := AppPage.Surface;
  SkipPack.Left := 0;
  SkipPack.Top := AppPage.Edits[0].Top + AppPage.Edits[0].Height + ScaleY(24);
  SkipPack.Width := AppPage.SurfaceWidth;
  SkipPack.Caption := '跳过框架语言包下载（已安装语言包或离线时使用）';
  SkipPack.Checked := ExpandConstant('{param:SKIPLANGPACK|0}') = '1';

  LogPath := ExpandConstant('{localappdata}\stm32cubemx2-i18n\logs\') +
    GetDateTimeString('yyyymmdd-hhnnss-zzz', '-', ':') + '.log';
  LogPath := ExpandConstant('{param:OPLOG|' + LogPath + '}');
  ResultPath := ExpandConstant('{tmp}\result.txt');
  LogButton := TNewButton.Create(WizardForm);
  LogButton.Parent := WizardForm;
  LogButton.Left := ScaleX(16);
  LogButton.Top := WizardForm.CancelButton.Top;
  LogButton.Width := ScaleX(100);
  LogButton.Height := WizardForm.CancelButton.Height;
  LogButton.Caption := '查看操作日志';
  LogButton.OnClick := @OpenLog;
  LogButton.Visible := False;
  ProgressPage := CreateOutputProgressPage('正在处理', '请稍候，不要关闭本窗口');
end;

procedure CurPageChanged(CurPageID: Integer);
begin
  if CurPageID = AppPage.ID then SkipPack.Enabled := SelectedAction = 'install';
  LogButton.Visible := (CurPageID = wpPreparing) or (CurPageID = wpFinished);
  if CurPageID = wpFinished then begin
    if PartialSuccess then WizardForm.FinishedHeadingLabel.Caption := '已部署译文，框架语言包需要重试'
    else WizardForm.FinishedHeadingLabel.Caption := '操作完成';
    WizardForm.FinishedLabel.AutoSize := False;
    WizardForm.FinishedLabel.Height := WizardForm.FinishedLabel.Parent.ClientHeight -
      WizardForm.FinishedLabel.Top - ScaleY(20);
    WizardForm.FinishedLabel.Caption := ResultText + #13#10#13#10 + '操作日志已保存，可点击左下角查看。';
  end;
end;

function UpdateReadyMemo(Space, NewLine, MemoUserInfoInfo, MemoDirInfo,
  MemoTypeInfo, MemoComponentsInfo, MemoGroupInfo, MemoTasksInfo: String): String;
var App: String;
begin
  App := Trim(AppPage.Values[0]);
  if App = '' then App := '自动查找';
  Result := ActionPage.CheckListBox.ItemCaption[ActionPage.SelectedValueIndex] + NewLine +
    NewLine + 'CubeMX2：' + App + NewLine + NewLine +
    '本程序自带运行环境，无需安装 PowerShell 或 Node.js。' + NewLine +
    '安装 / 还原前请完全退出 STM32CubeMX2。';
end;

function FakeProgress(Ticks: Integer): Integer;
begin
  { Asymptotic fake bar: approaches 90% while work is still running. }
  Result := 90 - (90 * 12) div (12 + Ticks);
  if Result < 1 then Result := 1;
  if Result > 90 then Result := 90;
end;

procedure ShowProgress(const Status, Detail: String; Position: Integer);
begin
  if WizardSilent then Exit;
  ProgressPage.SetText(Status, Detail);
  ProgressPage.SetProgress(Position, 100);
  if not ProgressVisible then begin
    ProgressPage.Show;
    ProgressVisible := True;
  end;
end;

procedure HideProgress;
begin
  if ProgressVisible then begin
    ProgressPage.Hide;
    ProgressVisible := False;
  end;
end;

procedure ClearStartupInfo(var Startup: TStartupInfoW);
begin
  Startup.cb := SizeOf(Startup);
  Startup.lpReserved := 0;
  Startup.lpDesktop := 0;
  Startup.lpTitle := 0;
  Startup.dwX := 0;
  Startup.dwY := 0;
  Startup.dwXSize := 0;
  Startup.dwYSize := 0;
  Startup.dwXCountChars := 0;
  Startup.dwYCountChars := 0;
  Startup.dwFillAttribute := 0;
  Startup.dwFlags := STARTF_USESHOWWINDOW;
  Startup.wShowWindow := SW_HIDE;
  Startup.cbReserved2 := 0;
  Startup.lpReserved2 := 0;
  Startup.hStdInput := 0;
  Startup.hStdOutput := 0;
  Startup.hStdError := 0;
end;

procedure ClearProcessInfo(var ProcessInfo: TProcessInformation);
begin
  ProcessInfo.hProcess := 0;
  ProcessInfo.hThread := 0;
  ProcessInfo.dwProcessId := 0;
  ProcessInfo.dwThreadId := 0;
end;

function StartNode(const NodePath, Args, WorkDir: String; var ProcessInfo: TProcessInformation;
  var ErrorCode: Integer): Boolean;
var
  Startup: TStartupInfoW;
  CommandLine: String;
begin
  ClearStartupInfo(Startup);
  ClearProcessInfo(ProcessInfo);
  CommandLine := '"' + NodePath + '" ' + Args;
  Result := CreateProcessW(NodePath, CommandLine, 0, 0, False, CREATE_NO_WINDOW, 0, WorkDir,
    Startup, ProcessInfo);
  if Result then ErrorCode := 0
  else ErrorCode := Integer(GetLastError);
end;

function WaitForNode(const ProcessInfo: TProcessInformation): Integer;
var
  ExitCode: DWORD;
  Ticks: Integer;
  Status, Detail: String;
begin
  Result := 1;
  if SkipPack.Checked then begin
    Status := '正在安装或检查中文译文';
    Detail := '通常只需几秒钟。';
  end else begin
    Status := '正在安装中文译文';
    Detail := '首次安装会下载框架语言包，可能需要几分钟。';
  end;
  ShowProgress(Status, Detail, 8);
  try
    Ticks := 0;
    while WaitForSingleObject(ProcessInfo.hProcess, 0) = WAIT_TIMEOUT do begin
      Ticks := Ticks + 1;
      ShowProgress(Status, Detail, FakeProgress(Ticks));
      Sleep(150);
    end;
    if not GetExitCodeProcess(ProcessInfo.hProcess, ExitCode) then ExitCode := 1;
    Result := Integer(ExitCode);
    if not WizardSilent then begin
      ShowProgress('即将完成', '', 100);
      Sleep(250);
    end;
  finally
    if ProcessInfo.hThread <> 0 then CloseHandle(ProcessInfo.hThread);
    if ProcessInfo.hProcess <> 0 then CloseHandle(ProcessInfo.hProcess);
  end;
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  Args, App, NodePath, WorkDir: String;
  Code, StartError: Integer;
  Raw: AnsiString;
  ProcessInfo: TProcessInformation;
begin
  Result := '';
  ResultText := '';
  PartialSuccess := False;
  WizardForm.PreparingLabel.Caption := '正在处理，请稍候。框架语言包下载需要联网。';
  try
    ShowProgress('正在准备运行环境', '首次启动会解压内置 Node.js。', 1);
    if not PayloadReady then begin
      ExtractTemporaryFiles('{tmp}\payload\*');
      PayloadReady := True;
    end;
    ForceDirectories(ExtractFileDir(LogPath));
    DeleteFile(ResultPath);
    Args := '"' + ExpandConstant('{tmp}\payload\dist\installer\windows.js') +
      '" --action ' + SelectedAction + ' --log "' + LogPath + '" --result "' + ResultPath + '"';
    App := Trim(AppPage.Values[0]);
    if Pos('"', App) > 0 then begin
      Result := '安装路径不能包含双引号。';
      Exit;
    end;
    if App <> '' then Args := Args + ' --app "' + AddBackslash(App) + '."';
    if SkipPack.Checked then Args := Args + ' --skip-langpack';
    NodePath := ExpandConstant('{tmp}\payload\node.exe');
    WorkDir := ExpandConstant('{tmp}\payload');
    if not StartNode(NodePath, Args, WorkDir, ProcessInfo, StartError) then begin
      Result := '无法启动内置运行环境：' + SysErrorMessage(StartError);
      Exit;
    end;
    Code := WaitForNode(ProcessInfo);
    Log('Node exit code: ' + IntToStr(Code));
    Log('Result file exists: ' + IntToStr(Ord(FileExists(ResultPath))));
    Log('Operation log exists: ' + IntToStr(Ord(FileExists(LogPath))));
    if LoadStringFromFile(ResultPath, Raw) then ResultText := UTF8Decode(Raw);
    if (Code <> 0) and (Code <> 2) then
      Result := '操作失败（退出码 ' + IntToStr(Code) + '）。可查看日志，返回修改路径或关闭 CubeMX2 后重试。' + #13#10 + ResultText
    else if ResultText = '' then Result := '未收到操作结果，请查看日志。'
    else PartialSuccess := Code = 2;
  finally
    HideProgress;
  end;
end;

function GetCustomSetupExitCode: Integer;
begin
  if PartialSuccess then Result := 10 else Result := 0;
end;
