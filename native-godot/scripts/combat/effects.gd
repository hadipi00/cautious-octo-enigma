# ============================================================
# effects.gd — افکت‌ها: انفجار، دود، فلش توپ، رد دود موشک، تریسر
# استخرهای سبک — GPUParticles یک‌بارمصرف + نور لحظه‌ای
# ============================================================
class_name Effects

var root: Node3D
var _explosions: Array = []
var _smoke_tex: Texture2D
var _glow_tex: Texture2D

func _init(parent: Node3D) -> void:
	root = Node3D.new()
	root.name = "Effects"
	parent.add_child(root)
	_smoke_tex = _make_puff_tex()
	_glow_tex = _make_glow_tex()

# ---------- انفجار ----------
func explosion(pos: Vector3, scale: float = 1.0) -> void:
	var fx := Node3D.new()
	fx.position = pos
	root.add_child(fx)

	var fire := GPUParticles3D.new()
	fire.amount = int(26 * scale)
	fire.one_shot = true
	fire.explosiveness = 1.0
	fire.lifetime = 0.9
	fire.speed_scale = 1.4
	var pm := ParticleProcessMaterial.new()
	pm.direction = Vector3(0, 1, 0)
	pm.spread = 180.0
	pm.initial_velocity_min = 8.0 * scale
	pm.initial_velocity_max = 26.0 * scale
	pm.gravity = Vector3(0, -4, 0)
	pm.scale_min = 3.0 * scale
	pm.scale_max = 7.0 * scale
	pm.damping_min = 2.0
	pm.damping_max = 5.0
	pm.scale_curve = _fade_curve_tex()
	pm.color_ramp = _grad_tex(_fire_gradient())
	fire.process_material = pm
	var qm := QuadMesh.new()
	qm.size = Vector2(1.4, 1.4)
	var qmat := StandardMaterial3D.new()
	qmat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	qmat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	qmat.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	qmat.albedo_texture = _glow_tex
	qmat.billboard_mode = BaseMaterial3D.BILLBOARD_PARTICLES
	qmat.vertex_color_use_as_albedo = true
	qm.material = qmat
	fire.draw_pass_1 = qm
	fx.add_child(fire)
	fire.emitting = true

	var smoke := GPUParticles3D.new()
	smoke.amount = int(18 * scale)
	smoke.one_shot = true
	smoke.explosiveness = 0.9
	smoke.lifetime = 2.6
	var sm := pm.duplicate()
	sm.initial_velocity_min = 3.0 * scale
	sm.initial_velocity_max = 9.0 * scale
	sm.gravity = Vector3(0, 2.5, 0)
	sm.scale_min = 5.0 * scale
	sm.scale_max = 10.0 * scale
	sm.color_ramp = _grad_tex(_smoke_gradient())
	smoke.process_material = sm
	var sqm := qm.duplicate()
	var sqmat: StandardMaterial3D = sqm.material
	sqmat.blend_mode = BaseMaterial3D.BLEND_MODE_MIX
	sqmat.albedo_texture = _smoke_tex
	sqm.material = sqmat
	smoke.draw_pass_1 = sqm
	fx.add_child(smoke)
	smoke.emitting = true

	# نور لحظه‌ای
	var light := OmniLight3D.new()
	light.light_color = Color(1.0, 0.6, 0.25)
	light.light_energy = 6.0 * scale
	light.omni_range = 60.0 * scale
	fx.add_child(light)

	_explosions.append({"node": fx, "light": light, "t": 0.0, "life": 2.8})

func _update(dt: float) -> void:
	for i in range(_explosions.size() - 1, -1, -1):
		var e: Dictionary = _explosions[i]
		e.t += dt
		var k: float = e.t / e.life
		if e.light != null and is_instance_valid(e.light):
			e.light.light_energy = maxf(0.0, (1.0 - k * 2.2)) * 6.0
		if e.t >= e.life:
			e.node.queue_free()
			_explosions.remove_at(i)

# ---------- دود ادامه‌دار (لاشه/سوختن) ----------
func smoke_plume(pos: Vector3, scale: float = 1.0, life: float = 4.0) -> void:
	var p := GPUParticles3D.new()
	p.amount = 14
	p.lifetime = life
	p.position = pos
	var pm := ParticleProcessMaterial.new()
	pm.direction = Vector3(0, 1, 0)
	pm.spread = 12.0
	pm.initial_velocity_min = 3.0
	pm.initial_velocity_max = 7.0
	pm.gravity = Vector3(0, 1.5, 0)
	pm.scale_min = 4.0 * scale
	pm.scale_max = 8.0 * scale
	pm.color_ramp = _grad_tex(_smoke_gradient())
	p.process_material = pm
	var qm := QuadMesh.new()
	qm.size = Vector2(1.6, 1.6)
	var qmat := StandardMaterial3D.new()
	qmat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	qmat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	qmat.albedo_texture = _smoke_tex
	qmat.billboard_mode = BaseMaterial3D.BILLBOARD_PARTICLES
	qmat.vertex_color_use_as_albedo = true
	qm.material = qmat
	p.draw_pass_1 = qm
	root.add_child(p)
	p.emitting = true
	_explosions.append({"node": p, "light": null, "t": 0.0, "life": life + 4.0})

func process(dt: float) -> void:
	_update(dt)

# ---------- بافت‌ها ----------
func _make_puff_tex() -> Texture2D:
	var img := Image.create(128, 128, false, Image.FORMAT_RGBA8)
	for y in 128:
		for x in 128:
			var d := Vector2(x - 64, y - 64).length() / 62.0
			var a: float = clampf(1.0 - d, 0.0, 1.0)
			img.set_pixel(x, y, Color(0.9, 0.88, 0.86, a * a * 0.9))
	return ImageTexture.create_from_image(img)

func _make_glow_tex() -> Texture2D:
	var img := Image.create(128, 128, false, Image.FORMAT_RGBA8)
	for y in 128:
		for x in 128:
			var d := Vector2(x - 64, y - 64).length() / 62.0
			var a: float = clampf(1.0 - d, 0.0, 1.0)
			img.set_pixel(x, y, Color(1, 1, 1, pow(a, 1.6)))
	return ImageTexture.create_from_image(img)

func _fade_curve_tex() -> Texture2D:
	var c := Curve.new()
	c.add_point(Vector2(0.0, 1.0))
	c.add_point(Vector2(1.0, 0.0))
	var t := CurveTexture.new()
	t.curve = c
	return t

func _grad_tex(g: Gradient) -> Texture2D:
	var t := GradientTexture1D.new()
	t.gradient = g
	return t

func _fire_gradient() -> Gradient:
	var g := Gradient.new()
	g.set_color(0, Color(1.0, 0.95, 0.7, 1.0))
	g.add_point(0.3, Color(1.0, 0.55, 0.15, 0.9))
	g.add_point(0.7, Color(0.6, 0.2, 0.08, 0.5))
	g.set_color(1, Color(0.2, 0.15, 0.12, 0.0))
	return g

func _smoke_gradient() -> Gradient:
	var g := Gradient.new()
	g.set_color(0, Color(0.25, 0.23, 0.22, 0.55))
	g.add_point(0.5, Color(0.35, 0.33, 0.32, 0.4))
	g.set_color(1, Color(0.5, 0.48, 0.46, 0.0))
	return g
