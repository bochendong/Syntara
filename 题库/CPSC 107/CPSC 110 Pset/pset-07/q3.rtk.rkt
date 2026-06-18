;; The first three lines of this file were inserted by DrRacket. They record metadata
;; about the language level of this file in a form that our tools can easily process.
#reader(lib "htdp-intermediate-reader.ss" "lang")((modname q3.rtk) (read-case-sensitive #t) (teachpacks ()) (htdp-settings #(#t constructor repeating-decimal #f #t none #f () #t)))
(require spd/tags)

(@htdf all-course-numbers)
(@signature Course -> ListOfNatural)
(@signature ListOfCourse -> ListOfNatural)
;; produce a list of all course numbers in given tree
(check-expect (all-course-numbers C100) (list 100))
(check-expect (all-course-numbers C213) (list 213 313 317))
(check-expect (all-course-numbers C210)
              (list 210 213 313 317 221 304 313
                    314 317 320 322 310 319 311 312))

(@template-origin Course ListOfCourse encapsulated)

(define (all-course-numbers c)
  (local [(define (all-course-numbers--course c)
            (cons (course-number c)
                  (all-course-numbers--loc (course-dependents c))))
          (define (all-course-numbers--loc loc)
            (cond [(empty? loc) empty]
                  [else
                   (append (all-course-numbers--course (first loc))
                           (all-course-numbers--loc (rest loc)))]))]
    (all-course-numbers--course c)))