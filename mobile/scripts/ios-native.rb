# After `cap add ios` and ios-setup.js: add the app's own Swift code and the home-screen widget to the Xcode project.
#   App target:     LarenestPlugins.swift (Face ID app lock, receipt scanning, widget hand-off) + app group entitlement
#   Widget target:  LarenestWidget.swift, a WidgetKit extension embedded in the app, sharing the app group
# Uses the xcodeproj gem (it comes with CocoaPods on GitHub's Macs; installed if missing).
require 'xcodeproj'
require 'fileutils'

M = File.expand_path('..', __dir__)
APP = File.join(M, 'ios', 'App')
NATIVE = File.join(M, 'native', 'ios')
proj_path = File.join(APP, 'App.xcodeproj')
proj = Xcodeproj::Project.open(proj_path)
app = proj.targets.find { |t| t.name == 'App' } or abort('No App target')
team = ENV['APPLE_TEAM_ID'].to_s
app_id = app.build_configurations.first.build_settings['PRODUCT_BUNDLE_IDENTIFIER'] || 'com.larenest.app'
deploy = app.build_configurations.first.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] || '15.0'
version = app.build_configurations.first.build_settings['MARKETING_VERSION']
build = app.build_configurations.first.build_settings['CURRENT_PROJECT_VERSION']

# 1. app target: Swift plugins and the entitlement
FileUtils.cp(File.join(NATIVE, 'App', 'LarenestPlugins.swift'), File.join(APP, 'App', 'LarenestPlugins.swift'))
FileUtils.cp(File.join(NATIVE, 'App', 'App.entitlements'), File.join(APP, 'App', 'App.entitlements'))
group = proj.main_group.find_subpath('App', false) || proj.main_group
unless group.files.any? { |f| f.path == 'LarenestPlugins.swift' }
  ref = group.new_reference('LarenestPlugins.swift')
  app.add_file_references([ref])
end
group.new_reference('App.entitlements') unless group.files.any? { |f| f.path == 'App.entitlements' }
app.build_configurations.each { |c| c.build_settings['CODE_SIGN_ENTITLEMENTS'] = 'App/App.entitlements' }

# 2. widget extension target
unless proj.targets.any? { |t| t.name == 'LarenestWidget' }
  wdir = File.join(APP, 'LarenestWidget'); FileUtils.mkdir_p(wdir)
  %w[LarenestWidget.swift Info.plist].each { |f| FileUtils.cp(File.join(NATIVE, 'Widget', f), File.join(wdir, f)) }
  FileUtils.cp(File.join(NATIVE, 'Widget', 'Widget.entitlements'), File.join(wdir, 'LarenestWidget.entitlements'))
  w = proj.new_target(:app_extension, 'LarenestWidget', :ios, deploy, nil, :swift)
  wg = proj.main_group.new_group('LarenestWidget', 'LarenestWidget')
  w.add_file_references([wg.new_reference('LarenestWidget.swift')])
  wg.new_reference('Info.plist'); wg.new_reference('LarenestWidget.entitlements')
  %w[WidgetKit SwiftUI].each { |fw| w.add_system_framework(fw) }
  w.build_configurations.each do |c|
    s = c.build_settings
    s['PRODUCT_BUNDLE_IDENTIFIER'] = "#{app_id}.widget"
    s['PRODUCT_NAME'] = '$(TARGET_NAME)'
    s['INFOPLIST_FILE'] = 'LarenestWidget/Info.plist'
    s['CODE_SIGN_ENTITLEMENTS'] = 'LarenestWidget/LarenestWidget.entitlements'
    s['SWIFT_VERSION'] = '5.0'
    s['TARGETED_DEVICE_FAMILY'] = '1,2'
    s['IPHONEOS_DEPLOYMENT_TARGET'] = deploy
    s['MARKETING_VERSION'] = version if version
    s['CURRENT_PROJECT_VERSION'] = build if build
    s['GENERATE_INFOPLIST_FILE'] = 'NO'
    s['SKIP_INSTALL'] = 'YES'
    s['LD_RUNPATH_SEARCH_PATHS'] = ['$(inherited)', '@executable_path/Frameworks', '@executable_path/../../Frameworks']
    s['CODE_SIGN_STYLE'] = 'Automatic'
    s['DEVELOPMENT_TEAM'] = team unless team.empty?
  end
  # build it with the app and embed it in the app's PlugIns folder
  app.add_dependency(w)
  embed = app.copy_files_build_phases.find { |p| p.name == 'Embed Foundation Extensions' } || app.new_copy_files_build_phase('Embed Foundation Extensions')
  embed.symbol_dst_subfolder_spec = :plug_ins
  bf = embed.add_file_reference(w.product_reference, true)
  bf.settings = { 'ATTRIBUTES' => ['RemoveHeadersOnCopy'] }
end
proj.save

# 3. the storyboard opens our view controller (it registers the plugins) instead of Capacitor's own
sb = File.join(APP, 'App', 'Base.lproj', 'Main.storyboard')
x = File.read(sb)
x = x.sub(/customClass="CAPBridgeViewController" customModule="Capacitor"/, 'customClass="LarenestViewController" customModule="App" customModuleProvider="target"')
File.write(sb, x)
puts "iOS native parts added (widget #{app_id}.widget, app group group.com.larenest.app)"
