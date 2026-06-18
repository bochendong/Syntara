;; The first three lines of this file were inserted by DrRacket. They record metadata
;; about the language level of this file in a form that our tools can easily process.
#reader(lib "htdp-intermediate-lambda-reader.ss" "lang")((modname f-p5-solution) (read-case-sensitive #t) (teachpacks ()) (htdp-settings #(#t constructor repeating-decimal #f #t none #f () #t)))
(require spd/tags)

(@assignment exams/2021w2-f/f-p5)

(@problem 1)
(@problem 2)
(@problem 3)
(@problem 4)
(@problem 5)


(@htdd Person)
(define-struct person (name age eye-color))
;; Person is (make-person String Natural String)
;; interp. a person with first name, age, and eye color
(define P1 (make-person "Azi" 25 "brown"))
(define P2 (make-person "Ari" 30 "green"))
(define P3 (make-person "Rey" 35 "hazel"))
(define P4 (make-person "Teri" 40 "green"))

(@htdf names-with-eye-color)
(@signature String (listof Person) -> (listof String))
;; produce list of names of people with given eye color
(check-expect (names-with-eye-color "brown" empty) empty)
(check-expect (names-with-eye-color "hazel" (list P2 P3))
              (list "Rey"))
(check-expect (names-with-eye-color "blue" (list P1 P2 P3 P4))
              empty)
(check-expect (names-with-eye-color "green" (list P1 P2 P3 P4))
              (list "Ari" "Teri"))

;; SOLUTION
(@template-origin fn-composition use-abstract-fn)

(define (names-with-eye-color color lop)
  (map person-name
       (filter (lambda (p)
                 (string=? (person-eye-color p) color))
               lop)))
