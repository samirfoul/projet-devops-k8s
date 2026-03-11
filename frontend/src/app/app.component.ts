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

  constructor(private http: HttpClient) { }

  ngOnInit() {
    this.loadStudents();
  }

  loadStudents() {
    this.http.get<any[]>(this.apiUrl).subscribe(data => {
      this.students = data;
    });
  }

  addStudent() {
    if (this.newStudent.name && this.newStudent.email) {
      this.http.post(this.apiUrl, this.newStudent).subscribe(() => {
        this.loadStudents(); // Recharge la liste
        this.newStudent = { name: '', email: '' }; // Vide le formulaire
      });
    }
  }

  deleteStudent(id: number) {
    this.http.delete(`${this.apiUrl}/${id}`).subscribe(() => {
      this.loadStudents();
    });
  }
}
