;; The first three lines of this file were inserted by DrRacket. They record metadata
;; about the language level of this file in a form that our tools can easily process.
#reader(lib "htdp-intermediate-reader.ss" "lang")((modname pset-6-format) (read-case-sensitive #t) (teachpacks ()) (htdp-settings #(#t constructor repeating-decimal #f #t none #f () #t)))
(require spd/tags)

(@htdd Course ListOfCourse)
(define-struct course (number credits dependents))
;; Course is (make-course Natural Natural ListOfCourse)
;; interp. a course with a course number,
;;         the number of credits the course is worth, and a
;;         list of courses that list this course as a direct pre-requisite

;; ListOfCourse is one of:
;; - empty
;; - (cons Course ListOfCourse)
;; interp. a list of courses

(define LOC0 empty)
(define C100 (make-course 100 3 LOC0))

(define (fn-for-course c)
  (... (course-number c)
       (course-credits c)
       (fn-for-loc (course-dependents c))))

(define (fn-for-loc loc)
  (cond [(empty? loc) (...)]
        [else
         (... (fn-for-course (first loc))
              (fn-for-loc (rest loc)))]))

;; ======all-numbers ======all-numbers ======all-numbers ======all-numbers ======
(@htdf all-numbers--course all-numbers--loc)
(@signature Course -> ListOfNatural)
(@signature ListOfCourse -> ListOfNatural)
;; produces the list of all course numbers in a Course tree
; (define (all-numbers--course c) empty) ; stub
; (define (all-numbers--loc c) empty) ; stub
;; Test

;; Template
(define (all-numbers--course c)
  (cons (course-number c)
          (all-numbers--loc (course-dependents c))))

;; Template
(define (all-numbers--loc loc)
  (cond [(empty? loc) empty]
        [else
         (append (all-numbers--course (first loc))
                 (all-numbers--loc (rest loc)))]))

;; ======all-credits-greater======all-credits-greater======all-credits-greater=====
(@htdf all-credits-greater--all-credits-greater--loc)
(@signature Course Natural -> ListOfCourse)
(@signature ListOfCourse Natural -> ListOfCourse)
;; Purpose
; Stub
; Stub
;; Test

;; Template
(define (all-credits-greater--course c n)
  (if (>= (course-credits c) n)
      (append (list c) (all-credits-greater--loc (course-dependents c) n))
      (all-credits-greater--loc (course-dependents c) n)))

;; Template
(define (all-credits-greater--loc loc n)
  (cond [(empty? loc) empty]
        [else
         (append (all-credits-greater--course (first loc) n)
                 (all-credits-greater--loc (rest loc) n))]))

;; ======largest-number======largest-number=======largest-number=====largest-number=
(@htdf largest-number--course largest-number--loc)
(@signature Course -> Natural)
(@signature ListOfCourse -> Natural)
;; Purpose
; Stub
; Stub
;; Test

;; Template
(define (largest-number--course c)
  (if (> (course-number c) (largest-number--loc (course-dependents c)))
      (course-number c)
      (largest-number--loc (course-dependents c))))

;; Template
(define (largest-number--loc loc)
  (cond [(empty? loc) 0]
        [else
         (if (> (largest-number--course (first loc))
                (largest-number--loc (rest loc)))
             (largest-number--course (first loc))
             (largest-number--loc (rest loc)))]))

;; ======find--course======find--course======find--course=====find--course=========
(@htdf find--course find--loc)
(@signature Course Natural -> Course or false)
(@signature ListOfCourse Natural -> Course or false)
;; Purpose
; Stub
; Stub
;; Test

;; Template

(define (find--course c n)
  (if (= (course-number c) n)
      c
      (find--loc (course-dependents c) n)))

;; Template
(define (find--loc loc n)
  (cond [(empty? loc) false]
        [else
         (if (not (false? (find--course (first loc) n)))
             (find--course (first loc) n)
             (find--loc (rest loc) n))]))
