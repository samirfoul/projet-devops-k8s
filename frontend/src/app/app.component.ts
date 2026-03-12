import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent implements OnInit {
  students: any[] = [];
  newStudent = { name: '', email: '' };
  apiUrl = '/api/students';

  // Variables pour l'édition
  isEditing = false;
  editingStudentId: number | null = null;

  constructor(private http: HttpClient) { }

  ngOnInit() {
    this.loadStudents();
  }

  loadStudents() {
    this.http.get<any[]>(this.apiUrl).subscribe(data => {
      this.students = data;
    });
  }

  // Modifié pour gérer AJOUT ou MODIFICATION
  saveStudent() {
    if (!this.newStudent.name || !this.newStudent.email) return;

    if (this.isEditing && this.editingStudentId) {
      // Mode MODIFICATION (PUT)
      this.http.put(`${this.apiUrl}/${this.editingStudentId}`, this.newStudent).subscribe(() => {
        this.loadStudents();
        this.cancelEdit(); // Revenir au mode ajout
      });
    } else {
      // Mode AJOUT (POST)
      this.http.post(this.apiUrl, this.newStudent).subscribe(() => {
        this.loadStudents();
        this.newStudent = { name: '', email: '' }; // Vide le formulaire
      });
    }
  }

  // Activer le mode édition
  startEdit(student: any) {
    this.isEditing = true;
    this.editingStudentId = student.id;
    // Remplit le formulaire avec les données actuelles
    this.newStudent = { name: student.name, email: student.email };
  }

  // Annuler l'édition
  cancelEdit() {
    this.isEditing = false;
    this.editingStudentId = null;
    this.newStudent = { name: '', email: '' }; // Vide le formulaire
  }

  deleteStudent(id: number) {
    this.http.delete(`${this.apiUrl}/${id}`).subscribe(() => {
      this.loadStudents();
    });
  }
}
