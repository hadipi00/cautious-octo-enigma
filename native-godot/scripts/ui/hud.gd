# ============================================================
# hud.gd — نمایشگر پرواز: سرعت/ارتفاع/ساعدوم/نشانه‌گر اهرم/جعبه هدف/
# رادار هشدار/هشدارها — همه با _draw (سبز روی شیشه)
# ============================================================
class_name HUD
extends Control

var main = null
var font: Font
var font_bold: Font
var green := Color(0.62, 1.0, 0.69)
var amber := Color(1.0, 0.7, 0.25)
var red := Color(1.0, 0.31, 0.31)
var banner_text := ""
var banner_t := 0.0
var kill_lines: Array = []
var hit_t := 0.0
var show_rwr := true

func _ready() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	font = load("res://assets/fonts/Vazirmatn-Regular.ttf")
	font_bold = load("res://assets/fonts/Vazirmatn-Bold.ttf")

func banner(t: String, dur: float = 4.0) -> void:
	banner_text = t
	banner_t = dur

func kill_feed(t: String) -> void:
	kill_lines.append({"t": t, "age": 0.0})
	if kill_lines.size() > 5:
		kill_lines.pop_front()

func flash_hit() -> void:
	hit_t = 0.18

func _process(dt: float) -> void:
	if banner_t > 0.0:
		banner_t -= dt
	hit_t = maxf(0.0, hit_t - dt)
	for i in range(kill_lines.size() - 1, -1, -1):
		kill_lines[i].age += dt
		if kill_lines[i].age > 5.0:
			kill_lines.pop_front()
	if main != null and main.state == main.State.FLIGHT:
		queue_redraw()

func _draw() -> void:
	if main == null or main.player == null:
		return
	var p: Aircraft = main.player
	var st: Dictionary = p.st
	var vp := size

	# ---------- اطلاعات پرواز ----------
	var spd := "IAS %d KM/H\nMACH %.2f" % [int(p.speed_kmh()), st.mach]
	draw_multiline_string(font, Vector2(48, vp.y * 0.40), spd, HORIZONTAL_ALIGNMENT_LEFT, -1, 20, 2, green)
	var alt := "ALT %d M\nAGL %d M" % [int(st.pos.y), int(st.pos.y - main.terrain.ground_height(st.pos.x, st.pos.z))]
	draw_multiline_string(font, Vector2(vp.x - 190, vp.y * 0.40), alt, HORIZONTAL_ALIGNMENT_LEFT, -1, 20, 2, green)
	var hdg := "HDG %03d°" % int(_heading_deg(st))
	draw_string(font, Vector2(vp.x / 2 - 60, 44), hdg, HORIZONTAL_ALIGNMENT_LEFT, -1, 20, green)
	var gtxt := "G %+.1f   AOA %.1f°" % [st.g_force, rad_to_deg(st.alpha)]
	draw_string(font, Vector2(vp.x / 2 - 90, vp.y * 0.60), gtxt, HORIZONTAL_ALIGNMENT_LEFT, -1, 17, green)
	var thr := "THR %d%% %s" % [int(st.thr * 100), "AB" if st.ab else ""]
	var fuel := "FUEL %d%%" % int(100.0 * st.fuel / float(p.spec.get("fuelCap", 2000)))
	draw_string(font, Vector2(48, vp.y - 88), thr + "   " + fuel, HORIZONTAL_ALIGNMENT_LEFT, -1, 16, green)
	var gear_s := "GEAR UP" if not st.gear else "GEAR DOWN"
	draw_string(font, Vector2(48, vp.y - 64), gear_s, HORIZONTAL_ALIGNMENT_LEFT, -1, 16, green if st.gear else amber)
	# تسلیحات
	var msl_n := 0
	for s in p.msl_stations:
		msl_n += s.left
	var wpn := "GUN %d   MSL %d   FLR %d" % [p.gun_ammo, msl_n, p.flares]
	draw_string(font, Vector2(vp.x - 260, vp.y - 64), wpn, HORIZONTAL_ALIGNMENT_LEFT, -1, 16, green)

	# ---------- نشانه‌گر اهرم ----------
	var ctr := Vector2(vp.x / 2, vp.y / 2)
	var reticle_pos: Vector2 = ctr + main.controls.cursor
	var col := green
	if main.controls.look_mode:
		col = Color(0.54, 0.77, 1.0)
	_draw_reticle(reticle_pos, col)
	if main.controls.look_mode:
		draw_string(font_bold, Vector2(vp.x / 2 - 90, vp.y * 0.30), "سر خلبان — نگاه آزاد", HORIZONTAL_ALIGNMENT_CENTER, -1, 17, Color(0.54, 0.77, 1.0))

	# ---------- جعبه اهداف ----------
	var cam: Camera3D = main.camera
	for ac in main.aircraft:
		if ac == p or not ac.alive:
			continue
		var to_ac: Vector3 = ac.global_position - cam.global_position
		var dist: float = to_ac.length()
		if dist > 12000:
			continue
		if cam.is_position_behind(ac.global_position):
			continue
		var sp: Vector2 = cam.unproject_position(ac.global_position)
		var box_col := red if ac.team == "red" else Color(0.4, 0.8, 1.0)
		var bs: float = clampf(2800.0 / maxf(dist, 100.0), 12.0, 46.0)
		draw_rect(Rect2(sp - Vector2(bs, bs) / 2, Vector2(bs, bs)), box_col, false, 1.6)
		if ac.team == "red":
			var info := "%s %.1fkm" % [ac.display_name, dist / 1000.0]
			draw_string(font, sp + Vector2(-bs / 2, bs / 2 + 16), info, HORIZONTAL_ALIGNMENT_LEFT, -1, 13, box_col)

	# ---------- نشانگر قفل ----------
	if p.lock_target != null and is_instance_valid(p.lock_target) and p.lock_target.alive:
		var lt: Aircraft = p.lock_target
		if not cam.is_position_behind(lt.global_position):
			var sp2: Vector2 = cam.unproject_position(lt.global_position)
			draw_arc(sp2, 26, 0, TAU, 24, Color.WHITE, 2.0)
			draw_string(font, sp2 + Vector2(-26, -34), "LOCK", HORIZONTAL_ALIGNMENT_LEFT, -1, 13, Color.WHITE)

	# ---------- هشدارها ----------
	var warn_y := vp.y * 0.24
	if st.stalled:
		draw_string(font_bold, Vector2(vp.x / 2 - 70, warn_y), "STALL", HORIZONTAL_ALIGNMENT_CENTER, -1, 24, red)
		warn_y += 30
	if weapons_inbound(p):
		draw_string(font_bold, Vector2(vp.x / 2 - 70, warn_y), "MISSILE", HORIZONTAL_ALIGNMENT_CENTER, -1, 24, red)
		warn_y += 30
	if st.blackout > 0.15 or st.redout > 0.15:
		# تیره شدن دید
		draw_rect(Rect2(Vector2.ZERO, vp), Color(0, 0, 0, clampf(maxf(st.blackout, st.redout) * 0.8, 0, 0.85)))

	# ---------- بنر و کیل‌فید ----------
	if banner_t > 0.0:
		draw_string(font_bold, Vector2(vp.x / 2 - 200, vp.y * 0.34), banner_text, HORIZONTAL_ALIGNMENT_CENTER, 400, 19, Color(0.85, 1.0, 0.88))
	var ky := vp.y * 0.18
	for kl in kill_lines:
		var a: float = clampf(1.0 - (kl.age - 4.0), 0.0, 1.0)
		draw_string(font, Vector2(vp.x - 320, ky), kl.t, HORIZONTAL_ALIGNMENT_LEFT, -1, 14, Color(1, 0.9, 0.75, a))
		ky += 22

	# ---------- هیت‌مارکر ----------
	if hit_t > 0.0:
		var c := ctr
		for off in [Vector2(-10, -10), Vector2(10, -10), Vector2(-10, 10), Vector2(10, 10)]:
			draw_line(c + off, c + off * 1.6, Color.WHITE, 2.5)

	# ---------- RWR ----------
	if show_rwr:
		var rwr_c := Vector2(vp.x - 110, vp.y - 170)
		draw_arc(rwr_c, 70, 0, TAU, 32, Color(0.5, 0.8, 0.6, 0.7), 1.5)
		draw_arc(rwr_c, 35, 0, TAU, 24, Color(0.5, 0.8, 0.6, 0.4), 1.0)
		for ac in main.aircraft:
			if ac == p or not ac.alive or ac.team != "red":
				continue
			var d: Vector3 = ac.global_position - p.global_position
			if d.length() > 15000:
				continue
			var brg := atan2(d.x, -d.z) - _heading_rad(st)
			var rr: float = clampf(d.length() / 15000.0 * 70.0, 8.0, 70.0)
			var pt := rwr_c + Vector2(sin(brg), -cos(brg)) * rr
			draw_circle(pt, 4.0, red)
		# موشک در راه
		if main.weapons.any_missile_inbound(p):
			draw_string(font_bold, rwr_c + Vector2(-26, 90), "MSL", HORIZONTAL_ALIGNMENT_CENTER, -1, 15, red)

func _draw_reticle(pos: Vector2, col: Color) -> void:
	draw_arc(pos, 16, 0, TAU, 24, col, 2.0)
	draw_circle(pos, 2.5, col)
	for off in [Vector2(0, -22), Vector2(0, 22), Vector2(-22, 0), Vector2(22, 0)]:
		draw_line(pos + off * 0.6, pos + off, col, 2.0)

func weapons_inbound(p: Aircraft) -> bool:
	if main == null or main.weapons == null:
		return false
	return main.weapons.any_missile_inbound(p)

func _heading_deg(st: Dictionary) -> float:
	var f: Vector3 = st.quat * Vector3.FORWARD
	return fposmod(rad_to_deg(atan2(-f.x, -f.z)), 360.0)

func _heading_rad(st: Dictionary) -> float:
	var f: Vector3 = st.quat * Vector3.FORWARD
	return atan2(-f.x, -f.z)
