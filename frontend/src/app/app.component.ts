import { Component, OnInit, AfterViewInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { HttpClient } from '@angular/common/http';

interface K8sNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  type: 'master' | 'worker' | 'pod';
  pulse: number;
  pulseSpeed: number;
  label: string;
}

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('k8sCanvas') canvasRef!: ElementRef<HTMLCanvasElement>;

  students: any[] = [];
  newStudent = { name: '', email: '' };
  apiUrl = '/api/students';

  isEditing = false;
  editingStudentId: number | null = null;

  private ctx!: CanvasRenderingContext2D;
  private nodes: K8sNode[] = [];
  private animFrameId!: number;
  private mouse = { x: -999, y: -999 };

  constructor(private http: HttpClient) {}

  ngOnInit() {
    this.loadStudents();
  }

  ngAfterViewInit() {
    this.initCanvas();
    this.animate();
  }

  ngOnDestroy() {
    cancelAnimationFrame(this.animFrameId);
  }

  private initCanvas() {
    const canvas = this.canvasRef.nativeElement;
    this.ctx = canvas.getContext('2d')!;
    this.resize(canvas);

    window.addEventListener('resize', () => this.resize(canvas));
    window.addEventListener('mousemove', (e) => {
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
    });

    this.createNodes(canvas.width, canvas.height);
  }

  private resize(canvas: HTMLCanvasElement) {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    if (this.nodes.length > 0) {
      this.createNodes(canvas.width, canvas.height);
    }
  }

  private createNodes(w: number, h: number) {
    this.nodes = [];

    // 3 master nodes (gros, bleu Kubernetes)
    for (let i = 0; i < 3; i++) {
      this.nodes.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        radius: 14,
        type: 'master',
        pulse: 0,
        pulseSpeed: 0.02 + Math.random() * 0.01,
        label: 'master'
      });
    }

    // 6 worker nodes (moyens, cyan)
    for (let i = 0; i < 6; i++) {
      this.nodes.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.6,
        vy: (Math.random() - 0.5) * 0.6,
        radius: 9,
        type: 'worker',
        pulse: Math.random() * Math.PI * 2,
        pulseSpeed: 0.025 + Math.random() * 0.015,
        label: 'node'
      });
    }

    // 20 pods (petits, blancs/verts)
    for (let i = 0; i < 20; i++) {
      this.nodes.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 1.0,
        vy: (Math.random() - 0.5) * 1.0,
        radius: 4,
        type: 'pod',
        pulse: Math.random() * Math.PI * 2,
        pulseSpeed: 0.04 + Math.random() * 0.02,
        label: 'pod'
      });
    }
  }

  private animate() {
    const canvas = this.canvasRef.nativeElement;
    const w = canvas.width;
    const h = canvas.height;

    this.ctx.clearRect(0, 0, w, h);

    // Fond dégradé
    const grad = this.ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, '#0a0f1e');
    grad.addColorStop(0.5, '#0d1b3e');
    grad.addColorStop(1, '#050d18');
    this.ctx.fillStyle = grad;
    this.ctx.fillRect(0, 0, w, h);

    // Mettre à jour et dessiner les nœuds
    for (const node of this.nodes) {
      node.pulse += node.pulseSpeed;
      node.x += node.vx;
      node.y += node.vy;

      // Rebondir sur les bords
      if (node.x < node.radius || node.x > w - node.radius) node.vx *= -1;
      if (node.y < node.radius || node.y > h - node.radius) node.vy *= -1;

      // Interaction souris : légère attraction
      const dx = this.mouse.x - node.x;
      const dy = this.mouse.y - node.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 120 && node.type !== 'master') {
        node.vx += (dx / dist) * 0.03;
        node.vy += (dy / dist) * 0.03;
        // Limiter la vitesse
        const speed = Math.sqrt(node.vx * node.vx + node.vy * node.vy);
        if (speed > 2) { node.vx = (node.vx / speed) * 2; node.vy = (node.vy / speed) * 2; }
      }
    }

    // Dessiner les connexions
    for (let i = 0; i < this.nodes.length; i++) {
      for (let j = i + 1; j < this.nodes.length; j++) {
        const a = this.nodes[i];
        const b = this.nodes[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const d = Math.sqrt(dx * dx + dy * dy);

        const maxDist = a.type === 'master' || b.type === 'master' ? 220 :
                        a.type === 'worker' || b.type === 'worker' ? 160 : 90;

        if (d < maxDist) {
          const alpha = (1 - d / maxDist) * 0.5;
          const color = (a.type === 'master' || b.type === 'master') ? `rgba(50, 108, 229, ${alpha})` :
                        (a.type === 'worker' || b.type === 'worker') ? `rgba(0, 200, 220, ${alpha * 0.7})` :
                        `rgba(100, 200, 120, ${alpha * 0.4})`;
          this.ctx.beginPath();
          this.ctx.strokeStyle = color;
          this.ctx.lineWidth = a.type === 'master' || b.type === 'master' ? 1.5 : 0.7;
          this.ctx.moveTo(a.x, a.y);
          this.ctx.lineTo(b.x, b.y);
          this.ctx.stroke();
        }
      }
    }

    // Dessiner les nœuds
    for (const node of this.nodes) {
      const pulseFactor = 1 + Math.sin(node.pulse) * 0.15;
      const r = node.radius * pulseFactor;

      this.ctx.beginPath();

      if (node.type === 'master') {
        // Hexagone pour les masters (forme Kubernetes)
        this.drawHexagon(node.x, node.y, r);
        this.ctx.fillStyle = '#326ce5';
        this.ctx.fill();
        this.ctx.strokeStyle = 'rgba(100, 160, 255, 0.9)';
        this.ctx.lineWidth = 2;
        this.ctx.stroke();

        // Halo
        const glow = this.ctx.createRadialGradient(node.x, node.y, r, node.x, node.y, r * 3);
        glow.addColorStop(0, 'rgba(50, 108, 229, 0.25)');
        glow.addColorStop(1, 'rgba(50, 108, 229, 0)');
        this.ctx.beginPath();
        this.drawHexagon(node.x, node.y, r * 3);
        this.ctx.fillStyle = glow;
        this.ctx.fill();

        // Label
        this.ctx.fillStyle = 'rgba(255,255,255,0.85)';
        this.ctx.font = 'bold 9px monospace';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('K8S', node.x, node.y + 3);

      } else if (node.type === 'worker') {
        this.ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
        this.ctx.fillStyle = 'rgba(0, 210, 230, 0.15)';
        this.ctx.fill();
        this.ctx.strokeStyle = 'rgba(0, 210, 230, 0.8)';
        this.ctx.lineWidth = 1.5;
        this.ctx.stroke();

        this.ctx.fillStyle = 'rgba(200,255,255,0.8)';
        this.ctx.font = '7px monospace';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('⬡', node.x, node.y + 3);

      } else {
        // Pod : petit cercle vert
        this.ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
        this.ctx.fillStyle = `rgba(80, 220, 100, ${0.6 + Math.sin(node.pulse) * 0.2})`;
        this.ctx.fill();
      }
    }

    this.animFrameId = requestAnimationFrame(() => this.animate());
  }

  private drawHexagon(x: number, y: number, r: number) {
    this.ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 3) * i - Math.PI / 6;
      const px = x + r * Math.cos(angle);
      const py = y + r * Math.sin(angle);
      i === 0 ? this.ctx.moveTo(px, py) : this.ctx.lineTo(px, py);
    }
    this.ctx.closePath();
  }

  loadStudents() {
    this.http.get<any[]>(this.apiUrl).subscribe(data => {
      this.students = data;
    });
  }

  saveStudent() {
    if (!this.newStudent.name || !this.newStudent.email) return;

    if (this.isEditing && this.editingStudentId) {
      this.http.put(`${this.apiUrl}/${this.editingStudentId}`, this.newStudent).subscribe(() => {
        this.loadStudents();
        this.cancelEdit();
      });
    } else {
      this.http.post(this.apiUrl, this.newStudent).subscribe(() => {
        this.loadStudents();
        this.newStudent = { name: '', email: '' };
      });
    }
  }

  startEdit(student: any) {
    this.isEditing = true;
    this.editingStudentId = student.id;
    this.newStudent = { name: student.name, email: student.email };
  }

  cancelEdit() {
    this.isEditing = false;
    this.editingStudentId = null;
    this.newStudent = { name: '', email: '' };
  }

  deleteStudent(id: number) {
    this.http.delete(`${this.apiUrl}/${id}`).subscribe(() => {
      this.loadStudents();
    });
  }
}
