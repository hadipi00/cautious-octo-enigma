# ============================================================
# audio.gd — صدای سینتی‌شده: موتور (لوپ WAV با پیچ/گین زنده)، توپ، انفجار
# ============================================================
class_name GameAudio
extends Node

const SR := 22050

var _engine_p: AudioStreamPlayer
var _base_buf: PackedByteArray
var _gun_cd := 0.0

func _ready() -> void:
	_base_buf = _make_engine_loop()
	var wav := AudioStreamWAV.new()
	wav.format = AudioStreamWAV.FORMAT_16_BITS
	wav.mix_rate = SR
	wav.stereo = false
	wav.loop_mode = AudioStreamWAV.LOOP_FORWARD
	wav.loop_begin = 0
	wav.loop_end = _base_buf.size() / 2
	wav.data = _base_buf
	_engine_p = AudioStreamPlayer.new()
	_engine_p.stream = wav
	_engine_p.volume_db = -60.0
	add_child(_engine_p)
	_engine_p.play()

func _make_engine_loop() -> PackedByteArray:
	# یک ثانیه: عوعوی توربین (سینوس‌های هارمونیک + نویز فیلترشده)
	var n := SR
	var bytes := PackedByteArray()
	bytes.resize(n * 2)
	var lp := 0.0
	for i in n:
		var t := float(i) / SR
		var v := 0.0
		v += sin(t * 2.0 * PI * 70.0) * 0.30
		v += sin(t * 2.0 * PI * 189.0) * 0.16
		v += sin(t * 2.0 * PI * 311.0) * 0.08
		var raw := randf() * 2.0 - 1.0
		lp = lerpf(lp, raw, 0.18)
		v += lp * 0.22
		# کراس‌فید لبه لوپ برای بدون‌درز بودن
		var edge := minf(i, n - 1 - i) / float(SR * 0.02)
		v *= clampf(edge, 0.0, 1.0)
		bytes.encode_s16(i * 2, int(clampf(v, -1.0, 1.0) * 26000.0))
	return bytes

func set_engine(st: Dictionary, flying: bool) -> void:
	if not flying:
		_engine_p.volume_db = -60.0
		return
	var thr: float = clampf(float(st.get("thr", 0.0)), 0.0, 1.0)
	var mach: float = float(st.get("mach", 0.0))
	_engine_p.pitch_scale = 0.7 + thr * 1.1 + mach * 0.5 + (0.35 if st.get("ab", false) else 0.0)
	_engine_p.volume_db = lerpf(-34.0, -7.0, thr)

func _play_wav(samples: PackedFloat32Array, volume_db: float) -> void:
	var wav := AudioStreamWAV.new()
	wav.format = AudioStreamWAV.FORMAT_16_BITS
	wav.mix_rate = SR
	var bytes := PackedByteArray()
	bytes.resize(samples.size() * 2)
	for i in samples.size():
		bytes.encode_s16(i * 2, int(clampf(samples[i], -1.0, 1.0) * 32767.0))
	wav.data = bytes
	var p := AudioStreamPlayer.new()
	p.stream = wav
	p.volume_db = volume_db
	add_child(p)
	p.play()
	p.finished.connect(p.queue_free)

func gun() -> void:
	_gun_cd -= get_process_delta_time()
	if _gun_cd > 0.0:
		return
	_gun_cd = 0.09
	var n := 900
	var s := PackedFloat32Array()
	s.resize(n)
	for i in n:
		var t := float(i) / SR
		var env := 1.0 - float(i) / n
		s[i] = (randf() * 2.0 - 1.0) * env * 0.8 + sin(t * 3000.0) * env * 0.3
	_play_wav(s, -14.0)

func explosion(vol := 1.0) -> void:
	var n := SR
	var s := PackedFloat32Array()
	s.resize(n)
	var lp := 0.0
	for i in n:
		var t := float(i) / SR
		var env := pow(1.0 - float(i) / n, 1.8)
		var raw := randf() * 2.0 - 1.0
		lp = lerpf(lp, raw, 0.12)
		s[i] = (lp * 2.2 + sin(t * 60.0) * env * 0.5) * env
	_play_wav(s, lerpf(-20.0, -4.0, clampf(vol, 0.0, 1.0)))

func ui_click() -> void:
	var n := 1200
	var s := PackedFloat32Array()
	s.resize(n)
	for i in n:
		var t := float(i) / SR
		var env := 1.0 - float(i) / n
		s[i] = sin(t * 2400.0) * env * 0.3
	_play_wav(s, -18.0)

func lock_beep() -> void:
	var n := 2205
	var s := PackedFloat32Array()
	s.resize(n)
	for i in n:
		var t := float(i) / SR
		s[i] = sin(t * 1400.0) * (1.0 - float(i) / n) * 0.35
	_play_wav(s, -14.0)

func missile_warn() -> void:
	var n := 4410
	var s := PackedFloat32Array()
	s.resize(n)
	for i in n:
		var t := float(i) / SR
		var b := 0.5 + 0.5 * sin(t * 30.0)
		s[i] = sin(t * 900.0) * b * 0.3
	_play_wav(s, -12.0)
