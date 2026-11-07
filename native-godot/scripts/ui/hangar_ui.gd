# ============================================================
# hangar_ui.gd — رابط آشیانه: انتخاب نبرد + کارت جت + کاروسل + نتیجه
# فونت وزیرمتن — فارسی RTL
# ============================================================
class_name HangarUI
extends CanvasLayer

signal battle_selected(kind: String)
signal plane_changed(idx: int)
signal settings_changed(quality: String)

var font_regular: Font
var font_bold: Font
var root_panel: Control
var results_panel: Control
var pause_panel: Control
var loading_panel: Control
var load_bar: ColorRect

var _jet_name: Label
var _jet_meta: Label
var _jet_arm: Label
var _bars := {}
var _car_name: Label
var _car_idx: Label

func _ready() -> void:
		font_regular = load("res://assets/fonts/Vazirmatn-Regular.ttf")
		font_bold = load("res://assets/fonts/Vazirmatn-Bold.ttf")
		var theme := Theme.new()
		theme.default_font = font_regular
		theme.default_font_size = 15

		root_panel = _full_rect_control()
		root_panel.theme = theme
		add_child(root_panel)
		_build_topbar(root_panel)
		_build_left(root_panel)
		_build_right(root_panel)
		_build_bottom(root_panel)
		_build_results()
		_build_pause()
		_build_loading()

func _full_rect_control() -> Control:
		var c := Control.new()
		c.set_anchors_preset(Control.PRESET_FULL_RECT)
		c.mouse_filter = Control.MOUSE_FILTER_IGNORE
		return c

func _mk_label(parent: Control, text: String, size: int, color: Color, pos: Vector2, sz := Vector2(200, 30), bold := false) -> Label:
		var l := Label.new()
		l.text = text
		l.add_theme_font_override("font", font_bold if bold else font_regular)
		l.add_theme_font_size_override("font_size", size)
		l.add_theme_color_override("font_color", color)
		l.position = pos
		l.size = sz
		parent.add_child(l)
		return l

func _mk_btn(parent: Control, text: String, pos: Vector2, sz: Vector2, cb: Callable, primary := false) -> Button:
		var b := Button.new()
		b.text = text
		b.position = pos
		b.size = sz
		b.add_theme_font_override("font", font_bold if primary else font_regular)
		b.add_theme_font_size_override("font_size", 15)
		if primary:
				var sb := StyleBoxFlat.new()
				sb.bg_color = Color(0.78, 0.60, 0.19)
				sb.set_corner_radius_all(9)
				b.add_theme_stylebox_override("normal", sb)
				var sbh := StyleBoxFlat.new()
				sbh.bg_color = Color(0.88, 0.70, 0.30)
				sbh.set_corner_radius_all(9)
				b.add_theme_stylebox_override("hover", sbh)
				b.add_theme_color_override("font_color", Color(0.08, 0.06, 0.02))
				b.add_theme_color_override("font_hover_color", Color(0.08, 0.06, 0.02))
		b.pressed.connect(cb)
		parent.add_child(b)
		return b

const GOLD := Color(0.91, 0.71, 0.30)
const TEXT := Color(0.87, 0.91, 0.95)
const DIM := Color(0.56, 0.64, 0.74)

func _build_topbar(parent: Control) -> void:
		_mk_label(parent, "AIRDOM", 30, GOLD, Vector2(40, 14), Vector2(300, 40), true)
		_mk_label(parent, "نسخه ویندوز ۱.۰", 13, DIM, Vector2(230, 24), Vector2(220, 26))

func _build_left(parent: Control) -> void:
		var titles := [
				["برتری هوایی", "موج‌های بی‌پایان دشمن", "air"],
				["نبرد بی‌آر", "رادار و موشک دوربرد", "bvr"],
				["حمله به بیس", "SAM فعال", "strike"],
				["نبرد تیمی", "با ۲ متحد", "team"],
				["پرواز آزاد", "گشت + فرود", "free"],
		]
		var y := 70.0
		for t in titles:
			var kind: String = t[2]
			var b := _mk_btn(parent, t[0] + "  —  " + t[1], Vector2(24, y), Vector2(290, 44), func(): battle_selected.emit(kind))
			y += 52
		# تنظیم کیفیت
		_mk_label(parent, "کیفیت گرافیک:", 14, DIM, Vector2(24, y + 14), Vector2(140, 24))
		var sel := OptionButton.new()
		sel.position = Vector2(170, y + 10)
		sel.size = Vector2(140, 32)
		sel.add_item("کم")
		sel.add_item("متوسط")
		sel.add_item("بالا")
		sel.add_item("فوق 4K")
		sel.select(2)
		sel.item_selected.connect(func(i: int):
				var q: String = ["low", "medium", "high", "ultra"][i]
				settings_changed.emit(q))
		parent.add_child(sel)

func _build_right(parent: Control) -> void:
		_jet_name = _mk_label(parent, "—", 22, TEXT, Vector2(1280, 78), Vector2(290, 34), true)
		_jet_meta = _mk_label(parent, "—", 13, DIM, Vector2(1280, 112), Vector2(290, 24))
		var stats := [["سرعت", "speed"], ["چابکی", "agility"], ["آتش", "firepower"], ["بدنه", "armor"]]
		var y := 150.0
		for st in stats:
				_mk_label(parent, st[0], 14, DIM, Vector2(1280, y), Vector2(60, 22))
				var bar_bg := ColorRect.new()
				bar_bg.color = Color(1, 1, 1, 0.10)
				bar_bg.position = Vector2(1345, y + 4)
				bar_bg.size = Vector2(200, 9)
				parent.add_child(bar_bg)
				var bar := ColorRect.new()
				bar.color = GOLD
				bar.position = Vector2(1345, y + 4)
				bar.size = Vector2(0, 9)
				parent.add_child(bar)
				_bars[st[1]] = bar
				y += 30
		_jet_arm = _mk_label(parent, "—", 12, DIM, Vector2(1280, y + 14), Vector2(300, 150))

func _build_bottom(parent: Control) -> void:
		var left := _mk_btn(parent, "◀", Vector2(620, 820), Vector2(52, 44), func(): plane_changed.emit(-1))
		var right := _mk_btn(parent, "▶", Vector2(928, 820), Vector2(52, 44), func(): plane_changed.emit(1))
		_car_name = _mk_label(parent, "—", 17, TEXT, Vector2(680, 822), Vector2(240, 26), true)
		_car_name.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		_car_idx = _mk_label(parent, "1 / 24", 12, DIM, Vector2(680, 846), Vector2(240, 20))
		_car_idx.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		_mk_label(parent, "درگ = چرخش · اسکرول = زوم", 12, DIM, Vector2(1290, 846), Vector2(280, 20))

func set_jet_card(spec: Dictionary, idx: int, total: int) -> void:
		_jet_name.text = spec.get("name", "—")
		var role_map := {"dogfighter": "جنگنده چرخشی", "interceptor": "رهگیر", "multirole": "چندمنظوره",
						"strike": "ضربتی", "attack": "تهاجمی", "air superiority": "برتری هوایی",
						"era-korea": "نسل اول", "delta interceptor": "دلتا رهگیر", "multirole light": "سبک چندمنظوره",
						"stealth": "پنهان‌کار"}
		var role: String = role_map.get(spec.get("role", ""), str(spec.get("role", "")))
		var nation_map := {"USA": "آمریکا", "RUSSIA": "روسیه", "FRANCE": "فرانسه", "EUROPE": "اروپا", "SWEDEN": "سوئد"}
		_jet_meta.text = "%s · %s" % [role, nation_map.get(spec.get("nation", ""), "")]
		var s: Dictionary = spec.get("stats", {})
		_bars["speed"].size.x = 200 * float(s.get("speed", 0.8))
		_bars["agility"].size.x = 200 * float(s.get("agility", 0.8))
		_bars["firepower"].size.x = 200 * float(s.get("firepower", 0.7))
		_bars["armor"].size.x = 200 * float(s.get("armor", 0.8))
		var guns: Array = spec.get("guns", [{}])
		var msl_txt := ""
		for m in spec.get("missiles", []):
				msl_txt += "%s×%d  " % [m.get("name", ""), m.get("count", 0)]
		_jet_arm.text = "توپ %s — %d گل\n%s\nبمب %d · فلر %d" % [
				guns[0].get("name", ""), guns[0].get("ammo", 0), msl_txt,
				spec.get("bombs", 0), spec.get("flares", 0)]
		_car_name.text = spec.get("name", "")
		_car_idx.text = "%d / %d" % [idx + 1, total]

# ---------- پایان مأموریت ----------
func _build_results() -> void:
		results_panel = _full_rect_control()
		results_panel.theme = Theme.new()
		results_panel.theme.default_font = font_regular
		add_child(results_panel)
		var dim := ColorRect.new()
		dim.color = Color(0.01, 0.02, 0.04, 0.6)
		dim.set_anchors_preset(Control.PRESET_FULL_RECT)
		results_panel.add_child(dim)
		var title := Label.new()
		title.name = "Title"
		title.text = "VICTORY"
		title.add_theme_font_override("font", font_bold)
		title.add_theme_font_size_override("font_size", 46)
		title.position = Vector2(0, 260)
		title.size = Vector2(1600, 60)
		title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		results_panel.add_child(title)
		var reason := Label.new()
		reason.name = "Reason"
		reason.add_theme_font_size_override("font_size", 17)
		reason.position = Vector2(0, 330)
		reason.size = Vector2(1600, 30)
		reason.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		results_panel.add_child(reason)
		var stats := Label.new()
		stats.name = "Stats"
		stats.add_theme_font_size_override("font_size", 18)
		stats.position = Vector2(0, 390)
		stats.size = Vector2(1600, 30)
		stats.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		results_panel.add_child(stats)
		_mk_btn(results_panel, "پرواز دوباره", Vector2(650, 470), Vector2(300, 46), func():
				results_panel.visible = false
				battle_selected.emit("__again__"), true)
		_mk_btn(results_panel, "بازگشت به آشیانه", Vector2(650, 526), Vector2(300, 42), func():
				results_panel.visible = false
				battle_selected.emit("__hangar__"))
		results_panel.visible = false

func show_results(win: bool, reason: String, score: int, kills: int, wave: int, best: int) -> void:
		var t: Label = results_panel.get_node("Title")
		t.text = "VICTORY" if win else "DEFEAT"
		t.add_theme_color_override("font_color", Color(0.62, 1.0, 0.69) if win else Color(1.0, 0.45, 0.4))
		(results_panel.get_node("Reason") as Label).text = reason
		(results_panel.get_node("Stats") as Label).text = "امتیاز %d    سرنگونی %d    موج %d    رکورد %d" % [score, kills, wave, best]
		results_panel.visible = true

# ---------- توقف ----------
func _build_pause() -> void:
		pause_panel = _full_rect_control()
		pause_panel.theme = Theme.new()
		pause_panel.theme.default_font = font_regular
		add_child(pause_panel)
		var dim := ColorRect.new()
		dim.color = Color(0.01, 0.02, 0.04, 0.55)
		dim.set_anchors_preset(Control.PRESET_FULL_RECT)
		pause_panel.add_child(dim)
		_mk_label(pause_panel, "توقف پرواز", 30, TEXT, Vector2(0, 330), Vector2(1600, 40), true).horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		_mk_btn(pause_panel, "ادامه پرواز", Vector2(650, 400), Vector2(300, 46), func():
				pause_panel.visible = false
				get_parent().resume_flight(), true)
		_mk_btn(pause_panel, "بازگشت به آشیانه", Vector2(650, 456), Vector2(300, 42), func():
				pause_panel.visible = false
				get_parent().emit_signal("battle_selected", "__hangar__"))
		pause_panel.visible = false

func show_pause() -> void:
		pause_panel.visible = true

func hide_pause() -> void:
		pause_panel.visible = false

# ---------- بارگذاری ----------
func _build_loading() -> void:
		loading_panel = _full_rect_control()
		add_child(loading_panel)
		var bg := ColorRect.new()
		bg.color = Color(0.02, 0.027, 0.043)
		bg.set_anchors_preset(Control.PRESET_FULL_RECT)
		loading_panel.add_child(bg)
		_mk_label(loading_panel, "AIRDOM", 56, GOLD, Vector2(0, 330), Vector2(1600, 80), true).horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		_mk_label(loading_panel, "شبیه‌ساز نبرد هوایی — هسته فیزیک واقعی", 16, DIM, Vector2(0, 420), Vector2(1600, 30)).horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		var bar_bg := ColorRect.new()
		bar_bg.color = Color(1, 1, 1, 0.08)
		bar_bg.position = Vector2(560, 490)
		bar_bg.size = Vector2(480, 8)
		loading_panel.add_child(bar_bg)
		load_bar = ColorRect.new()
		load_bar.color = GOLD
		load_bar.position = Vector2(560, 490)
		load_bar.size = Vector2(4, 8)
		loading_panel.add_child(load_bar)

func set_loading(f: float) -> void:
		load_bar.size.x = 476 * clampf(f, 0.0, 1.0)

func hide_loading() -> void:
		loading_panel.visible = false

func show_hangar_ui() -> void:
		root_panel.visible = true

func hide_hangar_ui() -> void:
		root_panel.visible = false
