import assert from "node:assert/strict";
import test from "node:test";
import { inferGradeImpact } from "../src/lib/workload-inference";

test("treats exams, finals, and projects as high impact", () => {
  assert.equal(inferGradeImpact("Final Exam"), "high");
  assert.equal(inferGradeImpact("Unit 3 Midterm"), "high");
  assert.equal(inferGradeImpact("Capstone Project proposal"), "high");
  assert.equal(inferGradeImpact("Argumentative Essay"), "high");
});

test("treats discussions and reading as low impact", () => {
  assert.equal(inferGradeImpact("Weekly Discussion Post"), "low");
  assert.equal(inferGradeImpact("Chapter 4 Reading"), "low");
  assert.equal(inferGradeImpact("Optional practice problems"), "low");
});

test("treats quizzes and homework as medium impact", () => {
  assert.equal(inferGradeImpact("Homework 7"), "medium");
  assert.equal(inferGradeImpact("Pop Quiz"), "medium");
  assert.equal(inferGradeImpact("Problem Set 2"), "medium");
});

test("high keyword outranks a low keyword in the same title", () => {
  assert.equal(inferGradeImpact("Final reflection essay"), "high");
});

test("falls back to point value only when no keyword matches", () => {
  assert.equal(inferGradeImpact("Module 5", 120), "high");
  assert.equal(inferGradeImpact("Module 5", 5), "low");
  assert.equal(inferGradeImpact("Module 5", 50), "medium");
});

test("defaults to medium when nothing is known", () => {
  assert.equal(inferGradeImpact("Module 5"), "medium");
});
