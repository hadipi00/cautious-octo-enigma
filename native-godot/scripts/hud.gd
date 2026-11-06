class_name AirdomHud
extends CanvasLayer
## HUD کابین — Labelها + رسم برداری (کروس‌هیر، نشانگر سرعت، جعبه هدف)

var main
var player: PlayerJet

var _spd: Label
var _alt: Label
var _hdg: Label
var _g: Label
var _thr: Label
var _wpn: Label
var _warn: Label
var _banner: Label
var _kills: Label
var _vignette: TextureRect
var _dmg: ColorRect
var _draw_ctl: Control

var _acc := 0.0
var _dmg_t := 0.0
var _banner_t := 0.0
var _muzzle_t := 0.0
var _blink := 0.0

const GREEN := Color(0.62, 1.0, 0.69)
const RED := Color(1.0, 0.35, 0.35)
const AMBER := Color(1.0, 0.7, 0.25)

func _ready() -> void:
	_spd = _label(Vector2(60, 260), 17)
	_alt = _label(Vector2(60, 330), 17)
	_hdg = _label(Vector2(60, 60), 17)
	_g = _label(Vector2(60, 400), 17)
	_thr = _label(Vector2(60, 520), 17)
	_wpn = _label(Vector2(60, 660), 17)
	_kills = _label(Vector2(60, 100), 17)
	_kills.add_theme_color_override("font_color", AMBER)
	_warn = _label(Vector2(0, 140), 22)
	_warn.size = Vector2(1600, 40)
	_warn.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_warn.add_theme_color_override("font_color", AMBER)
	_banner = _label(Vector2(0, 560), 20)
	_banner.size = Vector2(1600, 40)
	_banner.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_banner.add_theme_color_override("font_color", GREEN)

	# وینیت G — گرادیان شعاعی
	_vignette = TextureRect.new()
	var gt := GradientTexture2D.new()
	gt.fill = GradientTexture2D.FILL_RADIAL
	gt.fill_from = Vector2(0.5, 0.5)
	gt.fill_to = Vector2(0.5, 0.02)
	var gr := Gradient.new()
	gr.colors = PackedColorArray([Color(0, 0, 0, 0), Color(0.05, 0, 0, 1)])
	gr.offsets = PackedFloat32Array([0.45, 1.0])
	gt.gradient = gr
	gt.width = 512
	gt.height = 512
	_vignette.texture = gt
	_vignette.set_anchors_preset(Control.PRESET_FULL_RECT)
	_vignette.modulate.a = 0.0
	_vignette.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_vignette)

	_dmg = ColorRect.new()
	_dmg.color = Color(0.8, 0.05, 0.05, 0.0)
	_dmg.set_anchors_preset(Control.PRESET_FULL_RECT)
	_dmg.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_dmg)

	_draw_ctl = Control.new()
	_draw_ctl.set_anchors_preset(Control.PRESET_FULL_RECT)
	_draw_ctl.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_draw_ctl.draw.connect(_draw_hud)
	add_child(_draw_ctl)

func _label(pos: Vector2, size: int) -> Label:
	var l := Label.new()
	l.position = pos
	l.add_theme_font_size_override("font_size", size)
	l.add_theme_color_override("font_color", GREEN)
	l.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.9))
	l.add_theme_constant_override("outline_size", 5)
	add_child(l)
	return l

func update_player(p: PlayerJet) -> void:
	self.player = p

func flash_damage() -> void:
	_dmg_t = 0.6

func banner(txt: String) -> void:
	_banner.text = txt
	_banner_t = 3.0

func muzzle_flash() -> void:
	_muzzle_t = 0.06

func _process(dt: float) -> void:
	if player == null:
		return
	var st: Dictionary = player.st
	_acc += dt
	_blink += dt
	_dmg_t = maxf(0.0, _dmg_t - dt)
	_banner_t = maxf(0.0, _banner_t - dt)
	_muzzle_t = maxf(0.0, _muzzle_t - dt)

	_dmg.color.a = clampf(_dmg_t * 0.5, 0.0, 0.5)
	_vignette.modulate.a = maxf(st.blackout, st.redout * 0.9)
	_banner.modulate.a = clampf(_banner_t, 0.0, 1.0)

	if _acc < 0.1:
		_draw_ctl.queue_redraw()
		return
	_acc = 0.0

	var fwd: Vector3 = -st.basis.z
	var hdg: float = fposmod(atan2(fwd.x, -fwd.z) * 180.0 / PI + 360.0, 360.0)
	_spd.text = "IAS %d KM/H\nMACH %.2f" % [roundi(st.v * 3.6), st.mach]
	_alt.text = "ALT %d M\nVS %+d M/M" % [roundi(st.pos.y), roundi(st.vel.y * 60.0)]
	_hdg.text = "HDG %03d" % roundi(hdg)
	_g.text = "G %.1f   AOA %.1f" % [st.g, st.alpha * 180.0 / PI]
	_thr.text = "THR %d%% %s\nFUEL %d%%\nFLAP %d%%  GEAR %s" % [
		roundi(st.throttle * 100.0), "AB" if st.afterburner else "",
		roundi(st.fuel / player.fuel * 100.0),
		roundi(st.flaps * 100.0), "DOWN" if st.gear else "UP",
	]
	_wpn.text = "GUN %d\nMSL %d\nFLR %d" % [511, player.missiles_left(), player.flares_left()]
	var kills := 0
	for e in main.enemies:
		if is_instance_valid(e) and not e.alive:
			kills += 1
	_kills.text = "WAVE %d  KILLS %d" % [main.wave, main.kills]

	# هشدارها
	var warn := ""
	if st.alive:
		if missiles_warning():
			warn = "!! MISSILE INBOUND — FLARE (C) !!"
		elif st.stalled:
			warn = "STALL"
		elif not st.gear and st.pos.y - st.ground_y < 130.0 and st.vel.y < -6.0:
			warn = "GEAR!"
		elif st.pos.y - st.ground_y < 160.0 and st.vel.y < -14.0:
			warn = "PULL UP"
	_warn.text = warn
	_warn.modulate.a = 1.0 if fmod(_blink, 0.7) < 0.45 else 0.25
	_draw_ctl.queue_redraw()

func missiles_warning() -> bool:
	for m in main.missiles._missiles:
		if not m.friendly:
			return true
	return false

func _draw_hud() -> void:
	if player == null or not player.st.alive:
		return
	var cam := get_viewport().get_camera_3d()
	if cam == null:
		return
	var vs := get_viewport().get_visible_rect().size
	var center := vs * 0.5
	var st: Dictionary = player.st

	# کروس‌هیر
	_draw_ctl.draw_line(center + Vector2(-14, 0), center + Vector2(14, 0), GREEN, 2.0)
	_draw_ctl.draw_line(center + Vector2(0, -14), center + Vector2(0, 14), GREEN, 2.0)

	# فلاش شلیک
	if _muzzle_t > 0.0:
		_draw_ctl.draw_circle(center, 26.0, Color(1.0, 0.9, 0.5, 0.35))

	# نشانگر بردار سرعت
	if st.v > 30.0:
		var vp: Vector3 = st.pos + (st.vel.normalized() * 100.0)
		if not cam.is_position_behind(vp):
			var p := cam.unproject_position(vp)
			if p.x > -50 and p.x < vs.x + 50 and p.y > -50 and p.y < vs.y + 50:
				_draw_ctl.draw_arc(p, 9.0, 0, TAU, 20, GREEN, 2.0)
				_draw_ctl.draw_line(p + Vector2(-22, 0), p + Vector2(-9, 0), GREEN, 2.0)
				_draw_ctl.draw_line(p + Vector2(9, 0), p + Vector2(22, 0), GREEN, 2.0)

	# جعبه دشمن‌ها + پیش‌روی
	var fwd: Vector3 = -st.basis.z
	for e in main.enemies:
		if not is_instance_valid(e) or not e.alive:
			continue
		var ep: Vector3 = e.global_position
		if cam.is_position_behind(ep):
			continue
		var sp := cam.unproject_position(ep)
		if sp.x < -40 or sp.x > vs.x + 40 or sp.y < -40 or sp.y > vs.y + 40:
			continue
		var dist: float = st.pos.distance_to(ep)
		var col: Color = RED if player.locked_target() == e else Color(1.0, 0.6, 0.4, 0.8)
		_draw_ctl.draw_rect(Rect2(sp - Vector2(17, 17), Vector2(34, 34)), col, false, 2.0)
		_draw_ctl.draw_string(ThemeDB.fallback_font, sp + Vector2(22, -18),
			"%.1f km" % (dist / 1000.0), HORIZONTAL_ALIGNMENT_LEFT, -1, 13, col)
		# نشانگر پیش‌روی (lead)
		if player.locked_target() == e:
			var evel: Vector3 = -e.global_transform.basis.z * e.speed
			var lead_p: Vector3 = ep + evel * (dist / 1050.0)
			if not cam.is_position_behind(lead_p):
				var lp := cam.unproject_position(lead_p)
				_draw_ctl.draw_arc(lp, 7.0, 0, TAU, 16, Color(1.0, 0.9, 0.3), 2.0)
				_draw_ctl.draw_line(lp, sp, Color(1.0, 0.9, 0.3, 0.4), 1.0)

	# قفل
	var lt := player.lock_progress()
	if lt > 0.0 and player.locked_target() != null:
		var tcol := GREEN if lt >= 1.0 else AMBER
		_draw_ctl.draw_string(ThemeDB.fallback_font, center + Vector2(24, 40),
			("LOCKED" if lt >= 1.0 else "LOCKING %d%%" % roundi(lt * 100.0)),
			HORIZONTAL_ALIGNMENT_LEFT, -1, 14, tcol)
