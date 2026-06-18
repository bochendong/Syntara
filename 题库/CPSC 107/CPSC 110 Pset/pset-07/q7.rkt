;; The first three lines of this file were inserted by DrRacket. They record metadata
;; about the language level of this file in a form that our tools can easily process.
#reader(lib "htdp-intermediate-reader.ss" "lang")((modname q7) (read-case-sensitive #t) (teachpacks ()) (htdp-settings #(#t constructor repeating-decimal #f #t none #f () #t)))
(require spd/tags)

(@htdf three-criteria-courses)
(@signature Course -> ListOfNatural)
(@signature ListOfCourse -> ListOfNatural)
;; produces the numbers of all courses a course tree that met 3 criterias
(check-expect (three-criteria-courses C189) empty)
(check-expect (three-criteria-courses C110)
              (list 203 313 317 313 317 319 311 303))
(check-expect (three-criteria-courses C210)
              (list 313 317 313 317 319 311))
(check-expect (three-criteria-courses C213)
              (list 313 317))
(check-expect (three-criteria-courses C221)
              (list 313 317))
(check-expect (three-criteria-courses C310)
              (list 319))

(@template-origin Course ListOfCourse encapsulated)

(define (three-criteria-courses c)
  (local [(define (three-criteria-courses--course c)
            (if (and (odd? (course-number c))
                     (>= (course-credits c) 3)
                     (empty? (course-dependents c)))
                (cons (course-number c)
                      (three-criteria-courses--loc (course-dependents c)))
                (three-criteria-courses--loc (course-dependents c))))
          
          (define (three-criteria-courses--loc loc)
            (cond [(empty? loc) empty]
                  [else
                   (append (three-criteria-courses--course (first loc))
                           (three-criteria-courses--loc (rest loc)))]))]
    
    (three-criteria-courses--course c)))