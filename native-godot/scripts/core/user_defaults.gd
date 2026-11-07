# ذخیره‌سازی ساده تنظیمات/رکورد در user://
class_name UserDefaults

static func _path() -> String:
	return "user://airdom.cfg"

static func save_var(key: String, value) -> void:
	var cf := ConfigFile.new()
	cf.load(_path())
	cf.set_value("main", key, value)
	cf.save(_path())

static func load_var(key: String, fallback):
	var cf := ConfigFile.new()
	if cf.load(_path()) != OK:
		return fallback
	return cf.get_value("main", key, fallback)
