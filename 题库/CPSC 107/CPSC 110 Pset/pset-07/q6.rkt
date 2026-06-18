;; The first three lines of this file were inserted by DrRacket. They record metadata
;; about the language level of this file in a form that our tools can easily process.
#reader(lib "htdp-intermediate-reader.ss" "lang")((modname q6) (read-case-sensitive #t) (teachpacks ()) (htdp-settings #(#t constructor repeating-decimal #f #t none #f () #t)))
(require spd/tags)
(@htdf find-course)
(@signature Course Natural -> Course or false)
(@signature ListOfCourse Natural -> Course or false)
;; produce course in tree with course-num, false if can't find
(check-expect (find-course C189 189) C189)
(check-expect (find-course C189 210) false)
(check-expect (find-course C110 310) C310)
(check-expect (find-course C110 349) false)

(@template-origin Course ListOfCourse encapsulated try-catch)

(define (find-course c course-num)
  (local [(define (find-course--course c course-num)
            (if (= (course-number c) course-num)
                c
                (find-course--loc (course-dependents c) course-num)))
          
          (define (find-course--loc loc course-num)
            (cond [(empty? loc) false]
                  [else
                   (if (not (false? (find-course--course (first loc)
                                                         course-num)))
                       (find-course--course (first loc) course-num)
                       (find-course--loc (rest loc) course-num))]))]
    
    (find-course--course c course-num)))