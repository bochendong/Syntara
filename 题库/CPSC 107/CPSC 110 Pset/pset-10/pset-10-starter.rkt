;; The first three lines of this file were inserted by DrRacket. They record metadata
;; about the language level of this file in a form that our tools can easily process.
#reader(lib "htdp-intermediate-lambda-reader.ss" "lang")((modname pset-10-starter) (read-case-sensitive #t) (teachpacks ()) (htdp-settings #(#t constructor repeating-decimal #f #t none #f () #t)))
;; DO NOT PUT ANYTHING PERSONALLY IDENTIFYING BEYOND YOUR CWL IN THIS FILE.
;; YOUR CWLs WILL BE SUFFICIENT TO IDENTIFY YOU AND, IF YOU HAVE ONE, YOUR 
;; PARTNER.
;;
(require spd/tags)

(@assignment psets/pset-10); Do not edit or remove this tag

;; If you are:
;;   - A 110 or 107 student replace the first set of '???'s with your cwl.
;;     For problem sets, If you have a partner, please replace the second
;;     set of '???'s with their cwl.  Remember this, it is what you will
;;     do with these @cwl annotations for the whole course.
;;   - A UBC Extended Learning student, replace the first set of ??? with
;;     your email address as confirmed in the email you received from
;;     extended learning.  The handin password is also in that email.
;;     Remember this, it is what you will do with these @cwl annotations
;;     for the whole course.
;;   
(@cwl ??? ???)


(@problem 1)
;;
;; Complete the design of the following function.
;;
;; Hint: sometimes for functions with accumulators it is useful for
;;       the trampoline to deal with the special case of the empty
;;       list or empty tree using an if expression.
;;

(@htdf max-num-repeats)
(@signature (listof String) -> Natural)
;; produce maximum number of times  same string appears consecutively in los0
(check-expect (max-num-repeats empty) 0)
(check-expect (max-num-repeats (list "cat")) 1)
(check-expect (max-num-repeats (list "cat" "bird" "dog")) 1)
(check-expect (max-num-repeats (list "cat" "cat" "bird" "dog")) 2)
(check-expect (max-num-repeats (list "cat" "cat" "bird" "dog" "dog" "dog"))
              3)
(check-expect (max-num-repeats (list "cat" "cat" "cat"
                                     "bird"
                                     "boy" "boy" "boy"
                                     "toy" "toy" "toy" "toy" "toy"
                                     "trick"
                                     "zebra" "zebra" "zebra" "zebra"))
              5)
(check-expect (max-num-repeats (list "dog" "cat" "bird"
                                     "dog" "dog" "dog"
                                     "moose" "dog"))
              3)

(@template-origin (listof String) accumulator)

;; (define (max-num-repeats los) 0)

(define (max-num-repeats los0)
  ;; prev is String: the previous string in list
  ;; rsf is Integer: maximum number of times a string appears consecutively seen so far
  ;; curr is Integer: number of times the string has been seen so far
  (local [(define (fn-for-los los prev rsf curr)
            (cond [(empty? los) (max rsf curr)]
                  [else
                   (if (string=? prev (first los))
                       (fn-for-los (rest los)
                                   (first los)
                                   rsf
                                   (add1 curr))
                       (fn-for-los (rest los)
                                   (first los)
                                   (max rsf curr)
                                   1))]))]
                                   
  (if (empty? los0)
      0
      (fn-for-los (rest los0) (first los0) 0 1))))



(@problem 2)
;;
;; Complete the design of the following function.
;;
;; Your solution MUST BE TAIL RECURSIVE.
;;

(@htdf list-range)
(@signature (listof Integer) -> Natural)
;; produce the difference between the max and min integer in the list
;; CONSTRAINT: loi0 has at least one element
(check-expect (list-range (list 100)) 0)
(check-expect (list-range (list 2 -5 -10 50 80)) 90)
(check-expect (list-range (list 5000 -5 -100 50 0)) 5100)
(check-expect (list-range (list 3 8 1 2 9 4 2 3 -5)) 14)
(check-expect (list-range (list -5000 3 2 2 4 5000 4 2 3)) 10000)
(check-expect (list-range (list 400 500 500 400)) 100)

(@template-origin (listof Integer) accumulator)
 
; (define (list-range loi) 0)
(define (list-range loi0)
  ;; maximum is Integer: maximum integer seen so far
  ;; minimum is Integer: minimum integer seen so far
  (local [(define (fn-for-loi loi maximum minimum)
            (cond [(empty? loi) (- maximum minimum)]
                  [else
                   (fn-for-loi (rest loi)
                                (max (first loi) maximum)
                                (min (first loi) minimum))]))]
    (fn-for-loi (rest loi0) (first loi0) (first loi0))))


(@problem 3)
;;
;; Complete the design of the following function.
;;
;; Your solution MUST BE TAIL RECURSIVE.
;;
;; Hint: sometimes for functions with accumulators it is useful for
;;       the trampoline to deal with the special case of the empty
;;       list or empty tree using an if expression.
;;
(@htdf in-alphabetical-order?)
(@signature (listof String) -> Boolean)
;; produce true if list is sorted in order according to string-ci<=?
(check-expect (in-alphabetical-order? empty) true)
(check-expect (in-alphabetical-order? (list "a")) true)
(check-expect (in-alphabetical-order? (list "All" "bees" "Feel" "HAPPY")) true)
(check-expect (in-alphabetical-order? (list "aaaaa" "bb" "dd" "ccc")) false)

;; (define (in-alphabetical-order? los) false)
(define (in-alphabetical-order? los0)
  ;; prev is String: previous string is los
  (local [(define (fn-for-los los prev)
            (cond [(empty? los) true]
                  [else
                   (if (string-ci<=? prev (first los))
                       (fn-for-los (rest los) (first los))
                       false)]))]

    (if (empty? los0)
        true
        (fn-for-los (rest los0) (first los0)))))



;;
;; Please read through the data definition introduced in Problem Set 6
;; for a Course.
;;

(@htdd Course)
(define-struct course (number credits dependents))
;; Course is (make-course Natural Natural ListOfCourse)
;; interp. a course with a course number,
;;         the number of credits the course is worth,
;;         a list of courses that have this course as a pre-requisite


(@htdd ListOfCourse)
;; ListOfCourse is one of:
;; - empty
;; - (cons Course ListOfCourse)
;; interp. a list of courses

(define LOC0 empty)
(define C322 (make-course 322 3 LOC0))
(define C320 (make-course 320 3 LOC0))
(define C319 (make-course 319 4 LOC0))
(define C317 (make-course 317 3 LOC0))
(define C314 (make-course 314 3 LOC0))
(define C313 (make-course 313 3 LOC0))
(define C312 (make-course 312 3 LOC0))
(define C311 (make-course 311 3 LOC0))
(define LOC1 (list C319))
(define C310 (make-course 310 4 LOC1))
(define C304 (make-course 304 3 LOC0))
(define C302 (make-course 302 3 LOC0))
(define C303 (make-course 303 3 LOC0))
(define LOC2 (list C304 C313 C314 C317 C320 C322))
(define C221 (make-course 221 4 LOC2))
(define LOC3 (list C313 C317))
(define C213 (make-course 213 4 LOC3))
(define LOC4 (list C213 C221 C310 C311 C312))
(define C210 (make-course 210 4 LOC4))
(define C203 (make-course 203 3 LOC0))
(define C189 (make-course 189 1 LOC0))
(define LOC5 (list C189 C203 C210 C302 C303))
(define C110 (make-course 110 4 LOC5))
(define C100 (make-course 100 3 LOC0))

; c-wl (list C110 C189 C203 C210 C302 C303 C213 C221 C310 C311 C312 ...)

(define (fn-for-course c0)
  (local [(define (fn-for-course c)
            (... (course-number c)
                 (course-credits c)
                 (fn-for-loc (course-dependents c))))

          (define (fn-for-loc loc)
            (cond [(empty? loc) (...)]
                  [else
                   (... (fn-for-course (first loc))
                        (fn-for-loc (rest loc)))]))]
    (fn-for-course c0)))



;; Tree
;;     a
;;   b   d
;; e  f

(@problem 4)
;;
;; Complete the design of the following function.
;;
;; Your solution MUST BE TAIL RECURSIVE.
;;

(@htdf filter-credits-course-num)
(@signature Course Natural Natural -> (listof Course))
;; produce list of courses with >= num-credits and number >= course-num
(check-expect (filter-credits-course-num C100 50 3) (list C100))
(check-expect (filter-credits-course-num C100 100 3) (list C100))
(check-expect (filter-credits-course-num C100 210 3) empty)
(check-expect (filter-credits-course-num C100 100 2) (list C100))
(check-expect (filter-credits-course-num C100 100 4) empty)
(check-expect (filter-credits-course-num C213 300 3) (list C317 C313))
(check-expect (filter-credits-course-num C110 200 4)
              (list C319 C310 C221 C213 C210))

(@template-origin Course ListOfCourse accumulator)
            

; (define (filter-credits-course-num c course-num num-credits) empty)

(define (filter-credits-course-num c0 course-num num-credits)
  ;; c-wl is (listof Course): course worklist acc (what to process next?)
  ;; rsf is (listof Course): list of courses statisfying given criteria seen so far
  (local [(define (fn-for-course c c-wl rsf)
            (fn-for-loc (append (course-dependents c) c-wl)
                        ; rsf
                        (if (and (>= (course-credits c) num-credits)
                                 (>= (course-number c) course-num))
                            (cons c rsf)
                            rsf)))

          (define (fn-for-loc c-wl rsf)
            (cond [(empty? c-wl) rsf]
                  [else
                   (fn-for-course (first c-wl) (rest c-wl) rsf)]))]

    (fn-for-course c0 empty empty)))



  


(@problem 5)
;;
;; Complete the design of the following function.
;;
;; Your solution MUST BE TAIL RECURSIVE.
;;
;; HINTS:
;;   - this is a tandem worklist problem, if you aren't sure about
;;     why take the time to be sure before you proceed
;;   - You will produce a list of course numbers, but you may find it easier
;;     for your rsf accumulator to be a list of courses and then convert to
;;     course numbers right before producing the final result
;;

(@htdf max-credit-path)
(@signature Course -> (listof Natural))
;; produce course numbers in path starting at c0 w/ max total credits
(check-expect (max-credit-path C100) (list 100))
(check-expect (max-credit-path C320) (list 320))
(check-expect (max-credit-path C213) (list 213 313))
(check-expect (max-credit-path C302) (list 302))
(check-expect (max-credit-path C221) (list 221 304))
(check-expect (max-credit-path C110) (list 110 210 310 319))

; (define (max-credit-path c0) empty)

(define (max-credit-path c0)
  (local [
          (define (fn-for-course c path c-wl path-wl rsf)
            (local
              [(define npath (cons c path))]
              (if (empty? (course-dependents c))
                  (fn-for-loc c-wl path-wl (max-path npath rsf))
                  (fn-for-loc (append (course-dependents c) c-wl)
                              (append (make-list (length (course-dependents c)) npath) path-wl)
                              rsf))))

          (define (fn-for-loc c-wl path-wl rsf)
            (cond [(empty? c-wl) (reverse (map course-number rsf))]
                  [else
                   (fn-for-course (first c-wl)
                                  (first path-wl)
                                  (rest c-wl)
                                  (rest path-wl)
                                  rsf)]))

          (define (max-path npath rsf)
            (if (> (total-credits npath) (total-credits rsf))
                npath
                rsf))

          (define (total-credits loc)
            (foldr + 0 (map course-credits loc)))]

    (fn-for-course c0 empty empty empty empty)))














  


                            
