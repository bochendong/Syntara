;; The first three lines of this file were inserted by DrRacket. They record metadata
;; about the language level of this file in a form that our tools can easily process.
#reader(lib "htdp-intermediate-reader.ss" "lang")((modname q5) (read-case-sensitive #t) (teachpacks ()) (htdp-settings #(#t constructor repeating-decimal #f #t none #f () #t)))
(require spd/tags)

(@htdf max-course-num)
(@signature Course -> Natural)
(@signature ListOfCourse -> Natural)
;; produce the maximum course number a course in the tree has
;; CONSTRAINT: for max-course-num--loc, given list has at least 1 element
(check-expect (max-course-num C100) 100)
(check-expect (max-course-num C110) 322)

(@template-origin Course ListOfCourse encapsulated)

(define (max-course-num c)
  (local [(define (max-course-num--course c)
            (max (course-number c)
                 (max-course-num--loc (course-dependents c))))
          (define (max-course-num--loc loc)
            (cond [(empty? loc) 0]
                  [else
                   (max (max-course-num--course (first loc))
                        (max-course-num--loc (rest loc)))]))]
    (max-course-num--course c)))