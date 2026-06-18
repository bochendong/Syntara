;; The first three lines of this file were inserted by DrRacket. They record metadata
;; about the language level of this file in a form that our tools can easily process.
#reader(lib "htdp-intermediate-reader.ss" "lang")((modname q4) (read-case-sensitive #t) (teachpacks ()) (htdp-settings #(#t constructor repeating-decimal #f #t none #f () #t)))
(require spd/tags)

(@htdf courses-w-credits)
(@signature Course Natural -> ListOfCourse)
(@signature ListOfCourse Natural -> ListOfCourse)
;; produce list of courses in tree that have >= credits
(check-expect (courses-w-credits C100 4) empty)
(check-expect (courses-w-credits C100 3) (list C100))
(check-expect (courses-w-credits C100 2) (list C100))
(check-expect (courses-w-credits C110 3)
              (list C110 C203 C210 C213 C313 C317 C221 C304 C313 C314 C317 C320
                    C322 C310 C319 C311 C312 C302 C303))

(@template-origin Course ListOfCourse encapsulated)

(define (courses-w-credits c credits)
  (local [(define (courses-w-credits--course c credits)
            (if (>= (course-credits c) credits)
                (cons c (courses-w-credits--loc (course-dependents c) credits))
                (courses-w-credits--loc (course-dependents c) credits)))
          (define (courses-w-credits--loc loc credits)
            (cond [(empty? loc) empty]
                  [else
                   (append (courses-w-credits--course (first loc) credits)
                           (courses-w-credits--loc (rest loc) credits))]))]
    (courses-w-credits--course c credits)))

