# ============================================================
# cockpit.gd — کابین سه‌بعدی چسبیده به دوربین (نمای اول‌شخص)
# داشبورد + MFD زنده + استیک متحرک + قاب کانوپی — بدون برخورد با بدنه
# ============================================================
class_name Cockpit
extends Node3D

var stick: Node3D
var throttle_lever: MeshInstance3D
var _mfd_texs: Array = []
var _mfd_imgs: Array = []
var _mfd_t := 0.0
var main = null

func _ready() -> void:
	# چشم دوربین در مبدأ؛ محور جلو -Z
	var mat_dark := StandardMaterial3D.new()
	mat_dark.albedo_color = Color(0.10, 0.11, 0.13)
	mat_dark.roughness = 0.9
	var mat_panel := StandardMaterial3D.new()
	mat_panel.albedo_color = Color(0.16, 0.19, 0.22)
	mat_panel.roughness = 0.85
	var mat_metal := StandardMaterial3D.new()
	mat_metal.albedo_color = Color(0.45, 0.48, 0.52)
	mat_metal.metallic = 0.7
	mat_metal.roughness = 0.4

	# کف
	var floor_mesh := MeshInstance3D.new()
	var fb := BoxMesh.new()
	fb.size = Vector3(0.9, 0.05, 1.6)
	floor_mesh.mesh = fb
	floor_mesh.position = Vector3(0, -0.42, -0.15)
	floor_mesh.material_override = mat_dark
	add_child(floor_mesh)
	# داشبورد
	var panel := MeshInstance3D.new()
	var pb := BoxMesh.new()
	pb.size = Vector3(0.95, 0.06, 0.4)
	panel.mesh = pb
	panel.position = Vector3(0, 0.13, -0.62)
	panel.rotation.x = -0.42
	panel.material_override = mat_dark
	add_child(panel)
	var glare := MeshInstance3D.new()
	var gb := BoxMesh.new()
	gb.size = Vector3(0.95, 0.05, 0.3)
	glare.mesh = gb
	glare.position = Vector3(0, 0.16, -0.75)
	glare.material_override = mat_dark
	add_child(glare)
	# کنسول کناری
	for sx in [-1.0, 1.0]:
		var con := MeshInstance3D.new()
		var cb := BoxMesh.new()
		cb.size = Vector3(0.22, 0.14, 0.9)
		con.mesh = cb
		con.position = Vector3(sx * 0.52, -0.06, -0.2)
		con.material_override = mat_panel
		add_child(con)
		# چراغ‌های کوچک
		for i in 4:
			var led := MeshInstance3D.new()
			var ls := SphereMesh.new()
			ls.radius = 0.008
			ls.height = 0.016
			led.mesh = ls
			led.position = Vector3(sx * 0.48, 0.012, -0.45 + i * 0.16)
			led.material_override = _emissive(Color(0.4, 1.0, 0.63) if i % 2 == 0 else Color(0.2, 0.25, 0.3))
			add_child(led)
	# MFDها
	for i in 2:
		var img := Image.create(128, 128, false, Image.FORMAT_RGBA8)
		img.fill(Color(0.01, 0.03, 0.02))
		var tex := ImageTexture.create_from_image(img)
		var mfd := MeshInstance3D.new()
		var mq := PlaneMesh.new()
		mq.size = Vector2(0.26, 0.26)
		mfd.mesh = mq
		mfd.position = Vector3(-0.19 + i * 0.38, 0.0, -0.6)
		mfd.rotation.x = -0.35
		var mm := StandardMaterial3D.new()
		mm.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		mm.albedo_texture = tex
		mm.emission_enabled = true
		mm.emission = Color(0.2, 0.5, 0.35)
		mm.emission_energy_multiplier = 0.6
		mfd.material_override = mm
		add_child(mfd)
		_mfd_texs.append(tex)
		_mfd_imgs.append(img)
	# قاب کانوپی
	for sx in [-1.0, 1.0]:
		var rail := MeshInstance3D.new()
		var rb := BoxMesh.new()
		rb.size = Vector3(0.04, 0.04, 1.5)
		rail.mesh = rb
		rail.position = Vector3(sx * 0.5, 0.22, -0.3)
		rail.material_override = mat_metal
		add_child(rail)
	var arch := MeshInstance3D.new()
	var at := TorusMesh.new()
	at.inner_radius = 0.5
	at.outer_radius = 0.53
	arch.mesh = at
	arch.position = Vector3(0, 0.22, -0.85)
	arch.material_override = mat_metal
	add_child(arch)
	# شیشه جلو (ملایم)
	var glass := MeshInstance3D.new()
	var gq := PlaneMesh.new()
	gq.size = Vector2(0.7, 0.45)
	glass.mesh = gq
	glass.position = Vector3(0, 0.26, -0.82)
	glass.rotation.x = -0.25
	var gm := StandardMaterial3D.new()
	gm.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	gm.albedo_color = Color(0.6, 0.8, 0.9, 0.06)
	gm.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	glass.material_override = gm
	add_child(glass)
	# استیک
	stick = Node3D.new()
	stick.position = Vector3(-0.32, -0.14, -0.25)
	var shaft := MeshInstance3D.new()
	var sc := CylinderMesh.new()
	sc.top_radius = 0.018
	sc.bottom_radius = 0.026
	sc.height = 0.26
	shaft.mesh = sc
	shaft.position.y = 0.13
	shaft.material_override = mat_dark
	var grip := MeshInstance3D.new()
	var gs := SphereMesh.new()
	gs.radius = 0.04
	gs.height = 0.08
	grip.mesh = gs
	grip.position.y = 0.27
	grip.material_override = mat_dark
	stick.add_child(shaft)
	stick.add_child(grip)
	add_child(stick)
	# گاز
	throttle_lever = MeshInstance3D.new()
	var tb := BoxMesh.new()
	tb.size = Vector3(0.04, 0.04, 0.14)
	throttle_lever.mesh = tb
	throttle_lever.position = Vector3(0.16, -0.1, -0.32)
	throttle_lever.material_override = mat_dark
	add_child(throttle_lever)

func update_from(dt: float, player: Aircraft, game) -> void:
	if stick != null:
		stick.rotation.z = clampf(player.input.roll, -1, 1) * 0.4
		stick.rotation.x = clampf(player.input.pitch, -1, 1) * 0.3
	if throttle_lever != null:
		throttle_lever.position.z = -0.32 + (player.st.thr - 0.5) * 0.08
	_mfd_t -= dt
	if _mfd_t <= 0.0:
		_mfd_t = 0.25
		_draw_radar_mfd(0, player)
		_draw_status_mfd(1, player)

func _draw_radar_mfd(idx: int, player: Aircraft) -> void:
	var img: Image = _mfd_imgs[idx]
	img.fill(Color(0.01, 0.04, 0.03))
	var c := 64
	var r := 52
	# حلقه‌های برد
	for rr in [r, r * 2 / 3, r / 3]:
		for a in 72:
			var ang := TAU * a / 72.0
			var x := c + int(cos(ang) * rr)
			var y := c + int(sin(ang) * rr)
			if x >= 0 and x < 128 and y >= 0 and y < 128:
				img.set_pixel(x, y, Color(0.1, 0.3, 0.2))
	# پرچو
	var sweep := fmod(Time.get_ticks_msec() / 900.0, TAU)
	for a in 14:
		var ang := sweep - a * 0.05
		var x := c + int(cos(ang) * r)
		var y := c + int(sin(ang) * r)
		if x >= 0 and x < 128 and y >= 0 and y < 128:
			img.set_pixel(x, y, Color(0.4, 1.0, 0.6))
	# تماس‌ها
	if main != null:
		for e in main.aircraft:
			if e == player or not e.alive:
				continue
			var rel: Vector3 = player.st.quat.inverse() * (e.global_position - player.global_position)
			var dd := Vector2(rel.x, rel.z).length()
			if dd > 12000:
				continue
			var px := c + int(rel.x / 12000.0 * r)
			var py := c + int(-(-rel.z) / 12000.0 * r)  # جلو = بالا
			py = c - int(rel.z / 12000.0 * r)
			if Vector2(px - c, py - c).length() < r:
				var col := Color.WHITE if player.lock_target == e else Color(1, 0.3, 0.3)
				for dx in range(-2, 3):
					for dy in range(-2, 3):
						if px + dx >= 0 and px + dx < 128 and py + dy >= 0 and py + dy < 128:
							img.set_pixel(px + dx, py + dy, col)
	_mfd_texs[idx].update(img)

func _draw_status_mfd(idx: int, player: Aircraft) -> void:
	var img: Image = _mfd_imgs[idx]
	img.fill(Color(0.01, 0.04, 0.03))
	# نوارها
	var bars := [
		["THR", player.st.thr, Color(0.4, 1.0, 0.6)],
		["FUEL", player.st.fuel / float(player.spec.get("fuelCap", 2000)), Color(1.0, 0.8, 0.4)],
		["HULL", player.st.hp / player.hp_max, Color(0.4, 1.0, 0.6) if player.st.hp > player.hp_max * 0.4 else Color(1, 0.3, 0.3)],
	]
	var y := 14
	for b in bars:
		var w := int(90 * clampf(b[1], 0.0, 1.0))
		for x in range(20, 110):
			var col: Color = b[2] if x - 20 < w else Color(0.1, 0.15, 0.13)
			for dy in 7:
				if y + dy < 128:
					img.set_pixel(x, y + dy, col)
		y += 18
	# سرعت/ارتفاع متنی ساده (بلاک‌های شماره‌مانند)
	var st: Dictionary = player.st
	var v := int(st.V)
	var blocks := [int(v / 100.0) % 10, int(v / 10.0) % 10, v % 10]
	for bi in 3:
		var bx := 20 + bi * 14
		for seg in 7:
			# نمایش سگمنتی ساده
			var on: bool = (blocks[bi] >> seg) & 1 == 1
			if on:
				for dx in 9:
					for dy in 5:
						img.set_pixel(bx + dx, 78 + seg * 7 + dy, Color(0.5, 1.0, 0.7))
	_mfd_texs[idx].update(img)

func _emissive(c: Color) -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	m.albedo_color = c
	return m
